import type { Message } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { realtimeBus } from '../notifications/notification-bus';

export type MessageDto = {
  id: string;
  leadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string | null;
  hasMedia: boolean;
  sentBy: { id: string; name: string } | null;
  sentAt: string;
};

export function toMessageDto(message: Message & { sentBy?: { id: string; name: string } | null }): MessageDto {
  return {
    id: message.id,
    leadId: message.leadId,
    direction: message.direction,
    type: message.type,
    body: message.body,
    hasMedia: Boolean(message.mediaId),
    sentBy: message.sentBy ? { id: message.sentBy.id, name: message.sentBy.name } : null,
    sentAt: message.sentAt.toISOString(),
  };
}

/** Avisa o corretor do lead e os donos que chegou (ou saiu) uma mensagem. */
export async function publishLeadMessage(message: MessageDto): Promise<void> {
  try {
    const [lead, owners] = await Promise.all([
      prisma.lead.findUnique({ where: { id: message.leadId }, select: { brokerId: true } }),
      prisma.user.findMany({ where: { role: 'OWNER', active: true }, select: { id: true } }),
    ]);
    const recipients = new Set(owners.map((owner) => owner.id));
    if (lead?.brokerId) recipients.add(lead.brokerId);
    for (const userId of recipients) realtimeBus.publish(userId, 'message', message);
  } catch (error) {
    console.error('[tempo real] falha ao publicar mensagem', error);
  }
}
