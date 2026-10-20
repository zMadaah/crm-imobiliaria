import express, { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { enqueueWebhookEvent } from './event-processor';
import { isValidSignature } from './signature';
import type { WhatsAppWebhookPayload } from './webhook.types';

export const whatsappWebhookRouter = Router();

/** Verificação feita pela Meta ao cadastrar a URL do webhook. */
whatsappWebhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    res.status(200).type('text/plain').send(challenge);
    return;
  }
  res.sendStatus(403);
});

/**
 * Recebimento. Só valida, grava o payload bruto e responde 200.
 * Todo o trabalho pesado acontece depois, no event-processor.
 */
whatsappWebhookRouter.post('/', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.sendStatus(400);
    return;
  }

  if (!isValidSignature(rawBody, req.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) {
    res.sendStatus(401);
    return;
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.sendStatus(400);
    return;
  }

  // Webhooks só de status (entregue, lida) não são guardados nesta etapa.
  if (!hasInboundMessages(payload)) {
    res.sendStatus(200);
    return;
  }

  try {
    const event = await prisma.webhookEvent.create({
      data: { payload: payload as object },
      select: { id: true },
    });
    res.sendStatus(200);
    enqueueWebhookEvent(event.id);
  } catch (error) {
    console.error('[webhook] falha ao gravar evento', error);
    // 500 faz a Meta reenviar o webhook mais tarde.
    res.sendStatus(500);
  }
});

function hasInboundMessages(payload: WhatsAppWebhookPayload): boolean {
  return (payload.entry ?? []).some((entry) =>
    (entry.changes ?? []).some(
      (change) => change.field === 'messages' && (change.value?.messages?.length ?? 0) > 0,
    ),
  );
}
