import { prisma } from '../../lib/prisma';

/**
 * Rodízio: o lead vai para o corretor ativo que recebeu o último lead há mais tempo.
 * Se o lead já tiver corretor, mantém.
 */
export async function assignNextBroker(leadId: string): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { brokerId: true } });
    if (lead.brokerId) return lead.brokerId;

    const broker = await tx.user.findFirst({
      where: { role: 'BROKER', active: true },
      orderBy: [{ lastLeadAssignedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (!broker) {
      console.warn(`[rodízio] nenhum corretor ativo para receber o lead ${leadId}`);
      return null;
    }

    await tx.lead.update({ where: { id: leadId }, data: { brokerId: broker.id } });
    await tx.user.update({ where: { id: broker.id }, data: { lastLeadAssignedAt: new Date() } });
    return broker.id;
  });
}
