import type { LeadStage } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/** Muda a etapa do lead sempre registrando no histórico. */
export async function changeLeadStage(leadId: string, toStage: LeadStage, changedById: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
    if (lead.stage === toStage) return;

    await tx.lead.update({ where: { id: leadId }, data: { stage: toStage } });
    await tx.leadStageHistory.create({
      data: { leadId, fromStage: lead.stage, toStage, changedById },
    });
  });
}
