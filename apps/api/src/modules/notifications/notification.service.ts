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
