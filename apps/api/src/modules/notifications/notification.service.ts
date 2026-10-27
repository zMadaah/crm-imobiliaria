import type { Notification } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { realtimeBus, type NotificationEvent } from './notification-bus';

export function toNotificationEvent(notification: Notification): NotificationEvent {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    leadId: notification.leadId,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

/** Avisa o corretor do lead; sem corretor ativo, avisa os donos. */
export async function notifyHotLead(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      name: true,
      phone: true,
      score: true,
      originPost: true,
      broker: { select: { id: true, active: true } },
    },
  });

  const recipients =
    lead.broker?.active
      ? [lead.broker.id]
      : (await prisma.user.findMany({ where: { role: 'OWNER', active: true }, select: { id: true } })).map((u) => u.id);

  const title = `Lead quente: ${lead.name ?? lead.phone}`;
  const body = `Score ${lead.score}. Origem: ${lead.originPost ?? 'não identificada'}.`;

  for (const userId of recipients) {
    const notification = await prisma.notification.create({
      data: { userId, leadId, type: 'HOT_LEAD', title, body },
    });
    realtimeBus.publish(userId, 'notification', toNotificationEvent(notification));
  }
}

/** Cliente que já era lead preencheu de novo a página de atendimento. */
export async function notifyLeadReturned(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { name: true, phone: true, broker: { select: { id: true, active: true } } },
  });
  const recipients = lead.broker?.active
    ? [lead.broker.id]
    : (await prisma.user.findMany({ where: { role: 'OWNER', active: true }, select: { id: true } })).map((u) => u.id);

  for (const userId of recipients) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        leadId,
        type: 'LEAD_RETURNED',
        title: `Cliente voltou pelo site: ${lead.name ?? lead.phone}`,
        body: 'Respondeu de novo a página de atendimento. As respostas e o score foram atualizados.',
      },
    });
    realtimeBus.publish(userId, 'notification', toNotificationEvent(notification));
  }
}
