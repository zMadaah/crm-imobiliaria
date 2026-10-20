import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { prepareLeadForHumanReply } from '../bot/bot.service';
import { withLeadLock } from '../bot/lead-lock';
import { toMessageDto } from '../realtime/lead-events';
import { sendAndRecord } from '../whatsapp/outbound.service';
import { downloadWhatsAppMedia, MediaUnavailableError } from '../whatsapp/whatsapp.client';
import { leadAccessWhere } from './lead-access';
import { getServiceWindow } from './service-window';

export const leadMessagesRouter = Router({ mergeParams: true });

const PAGE_SIZE = 50;
const MAX_BODY = 4096;

function findAccessibleLead(req: Request<{ id: string }>) {
  return prisma.lead.findFirst({
    where: { AND: [{ id: req.params.id }, leadAccessWhere(req.user!)] },
    select: { id: true, phone: true, lastInboundAt: true },
  });
}

const historyQuery = z.object({ before: z.string().datetime().optional() });

leadMessagesRouter.get('/', async (req: Request<{ id: string }>, res) => {
  const lead = await findAccessibleLead(req);
  if (!lead) {
    res.status(404).json({ error: 'Lead não encontrado.' });
    return;
  }
  const parsed = historyQuery.safeParse(req.query);
  const before = parsed.success && parsed.data.before ? new Date(parsed.data.before) : undefined;

  const messages = await prisma.message.findMany({
    where: { leadId: lead.id, ...(before ? { sentAt: { lt: before } } : {}) },
    orderBy: { sentAt: 'desc' },
    take: PAGE_SIZE + 1,
    include: { sentBy: { select: { id: true, name: true } } },
  });

  res.json({
    items: messages.slice(0, PAGE_SIZE).reverse().map(toMessageDto),
    hasMore: messages.length > PAGE_SIZE,
  });
});

const sendSchema = z.object({ body: z.string().trim().min(1).max(MAX_BODY) });

leadMessagesRouter.post('/', async (req: Request<{ id: string }>, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Escreva uma mensagem de até ${MAX_BODY} caracteres.` });
    return;
  }

  const lead = await findAccessibleLead(req);
  if (!lead) {
    res.status(404).json({ error: 'Lead não encontrado.' });
    return;
  }

  if (!getServiceWindow(lead.lastInboundAt).open) {
    res.status(409).json({
      error: 'Já se passaram 24 horas desde a última mensagem do cliente. Ele precisa escrever de novo para você responder.',
    });
    return;
  }

  const user = req.user!;
  try {
    // Mesma fila do bot: evita o bot e o corretor responderem ao mesmo tempo.
    const message = await withLeadLock(lead.id, async () => {
      await prepareLeadForHumanReply(lead.id, { id: user.id, role: user.role });
      return sendAndRecord({
        leadId: lead.id,
        phone: lead.phone,
        message: { type: 'text', body: parsed.data.body },
        sentById: user.id,
      });
    });
    res.status(201).json(message);
  } catch (error) {
    console.error(`[painel] falha ao enviar mensagem ao lead ${lead.id}`, error);
    res.status(502).json({ error: 'O WhatsApp não aceitou a mensagem. Tente de novo em instantes.' });
  }
});

leadMessagesRouter.get('/:messageId/media', async (req: Request<{ id: string; messageId: string }>, res) => {
  const lead = await findAccessibleLead(req);
  const message = lead
    ? await prisma.message.findFirst({
        where: { id: req.params.messageId, leadId: lead.id },
        select: { mediaId: true },
      })
    : null;

  if (!message?.mediaId) {
    res.status(404).json({ error: 'Mídia não encontrada.' });
    return;
  }

  try {
    const file = await downloadWhatsAppMedia(message.mediaId);
    res.set({
      'Content-Type': file.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    });
    Readable.fromWeb(file.body as unknown as WebReadableStream).pipe(res);
  } catch (error) {
    if (error instanceof MediaUnavailableError) {
      res.status(404).json({ error: error.message });
      return;
    }
    throw error;
  }
});
