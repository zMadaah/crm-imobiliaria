import { prisma } from '../../lib/prisma';
import type { OutgoingMessage } from '../bot/bot-engine';
import { publishLeadMessage, toMessageDto, type MessageDto } from '../realtime/lead-events';
import { sendWhatsAppMessage } from './whatsapp.client';

type SendParams = {
  leadId: string;
  phone: string;
  message: OutgoingMessage;
  /** Nulo quando quem envia é o bot */
  sentById?: string | null;
};

/** Envia pelo WhatsApp, grava no histórico do lead e avisa o painel. */
export async function sendAndRecord({ leadId, phone, message, sentById = null }: SendParams): Promise<MessageDto> {
  const { waMessageId } = await sendWhatsAppMessage(phone, message);
  const sentAt = new Date();

  const [created] = await prisma.$transaction([
    prisma.message.create({
      data: {
        leadId,
        direction: 'OUTBOUND',
        type: message.type === 'text' ? 'text' : 'interactive',
        body: message.body,
        waMessageId,
        sentById,
        sentAt,
      },
      include: { sentBy: { select: { id: true, name: true } } },
    }),
    prisma.lead.update({ where: { id: leadId }, data: { lastMessageAt: sentAt } }),
  ]);

  const dto = toMessageDto(created);
  void publishLeadMessage(dto);
  return dto;
}
