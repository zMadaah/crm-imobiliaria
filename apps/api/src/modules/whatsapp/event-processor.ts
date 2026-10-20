import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { runBotForInboundMessage } from '../bot/bot.service';
import { findOrCreateLeadByPhone } from '../leads/lead.service';
import { publishLeadMessage, toMessageDto } from '../realtime/lead-events';
import { extractMessageContent, normalizePhone } from './message-content';
import { extractOrigin } from './origin';
import { isConfiguredNumber } from './phone-number';
import { env } from '../../config/env';
import type { WaContact, WaMessage, WhatsAppWebhookPayload } from './webhook.types';

const MAX_ATTEMPTS = 5;
const SWEEP_INTERVAL_MS = 60_000;
/** Evento em PROCESSING há mais que isso provavelmente morreu com o servidor. */
const STALE_PROCESSING_MS = 5 * 60_000;
const SWEEP_BATCH_SIZE = 50;

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

/** Dispara o processamento logo depois de o webhook responder. */
export function enqueueWebhookEvent(eventId: string): void {
  setImmediate(() => {
    void processWebhookEvent(eventId);
  });
}

export function startEventProcessor(): void {
  if (sweepTimer) return;
  void sweep();
  sweepTimer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
}

export function stopEventProcessor(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

/** Retoma eventos pendentes ou travados (ex.: servidor reiniciou no meio). */
async function sweep(): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    await prisma.webhookEvent.updateMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
      },
      data: { status: 'PENDING' },
    });

    const pending = await prisma.webhookEvent.findMany({
      where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { receivedAt: 'asc' },
      take: SWEEP_BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of pending) {
      await processWebhookEvent(id);
    }
  } catch (error) {
    console.error('[webhook] falha na varredura de eventos', error);
  } finally {
    sweepRunning = false;
  }
}

export async function processWebhookEvent(eventId: string): Promise<void> {
  // Reserva atômica: só um processo consegue passar o evento para PROCESSING.
  const claimed = await prisma.webhookEvent.updateMany({
    where: { id: eventId, status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });

  try {
    await handlePayload(event.payload as unknown as WhatsAppWebhookPayload);
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = event.attempts >= MAX_ATTEMPTS;
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: exhausted ? 'FAILED' : 'PENDING', lastError: message.slice(0, 2000) },
    });
    console.error(`[webhook] erro no evento ${eventId} (tentativa ${event.attempts})`, error);
  }
}

async function handlePayload(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const incomingNumberId = change.value.metadata?.phone_number_id;
      if (!isConfiguredNumber(incomingNumberId, env.WHATSAPP_PHONE_NUMBER_ID)) {
        console.warn(`[webhook] mensagem para outro número (${incomingNumberId}) ignorada`);
        continue;
      }

      const contacts = change.value.contacts ?? [];
      // Atualizações de status (entregue, lida) ficam fora desta etapa.
      for (const message of change.value.messages ?? []) {
        await handleInboundMessage(message, contacts);
      }
    }
  }
}

/**
 * Idempotente: reprocessar o mesmo evento não duplica lead nem mensagem.
 */
async function handleInboundMessage(message: WaMessage, contacts: WaContact[]): Promise<void> {
  const alreadySaved = await prisma.message.findUnique({
    where: { waMessageId: message.id },
    select: { id: true },
  });
  if (alreadySaved) return;

  const contact = contacts.find((c) => c.wa_id === message.from);
  const phone = normalizePhone(message.from);
  const { lead } = await findOrCreateLeadByPhone({
    phone,
    name: contact?.profile?.name?.trim() || null,
    origin: extractOrigin(message),
  });

  const content = extractMessageContent(message);
  const sentAtSeconds = Number(message.timestamp);

  const sentAt = Number.isFinite(sentAtSeconds) ? new Date(sentAtSeconds * 1000) : new Date();

  try {
    const [created] = await prisma.$transaction([
      prisma.message.create({
        data: {
          leadId: lead.id,
          direction: 'INBOUND',
          type: message.type,
          body: content.body,
          mediaId: content.mediaId,
          waMessageId: message.id,
          sentAt,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { lastMessageAt: sentAt, lastInboundAt: sentAt },
      }),
    ]);
    void publishLeadMessage(toMessageDto(created));
  } catch (error) {
    // Mesma mensagem gravada por outro processamento em paralelo: ignorar.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    throw error;
  }

  // A mensagem já está salva: uma falha no bot não pode fazer o evento ser reprocessado.
  try {
    await runBotForInboundMessage({ leadId: lead.id, phone, message });
  } catch (error) {
    console.error(`[bot] erro ao processar mensagem ${message.id}`, error);
  }
}
