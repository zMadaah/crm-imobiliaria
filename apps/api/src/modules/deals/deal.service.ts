import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { changeLeadStage } from '../leads/lead-stage.service';
import {
  allowedDealActions,
  STAGE_AFTER_ACTION,
  validateLoss,
  validateWin,
  type DealAction,
  type LossInput,
  type WinInput,
} from './deal-rules';

export class DealRuleError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] ?? 'Ação não permitida.');
  }
}

type Actor = { id: string; role: UserRole };

async function assertAllowed(leadId: string, action: DealAction, actor: Actor) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true, brokerId: true } });
  if (!allowedDealActions(lead.stage, actor.role).includes(action)) {
    throw new DealRuleError(['Essa ação não vale para a etapa atual do lead. Atualize a página.']);
  }
  return lead;
}

export async function startNegotiation(leadId: string, actor: Actor) {
  await assertAllowed(leadId, 'START_NEGOTIATION', actor);
  await changeLeadStage(leadId, STAGE_AFTER_ACTION.START_NEGOTIATION, actor.id);
}

export async function registerWin(leadId: string, input: WinInput, actor: Actor) {
  const lead = await assertAllowed(leadId, 'WIN', actor);
  const errors = validateWin(input);
  if (errors.length > 0) throw new DealRuleError(errors);

  await prisma.deal.create({
    data: {
      leadId,
      result: 'WON',
      kind: input.kind,
      value: new Prisma.Decimal(input.value.toFixed(2)),
      propertyReference: input.propertyReference?.trim() || null,
      brokerId: lead.brokerId,
      closedById: actor.id,
    },
  });
  await changeLeadStage(leadId, STAGE_AFTER_ACTION.WIN, actor.id);
}

export async function registerLoss(leadId: string, input: LossInput, actor: Actor) {
  const lead = await assertAllowed(leadId, 'LOSE', actor);
  const errors = validateLoss(input);
  if (errors.length > 0) throw new DealRuleError(errors);

  await prisma.deal.create({
    data: {
      leadId,
      result: 'LOST',
      lossReason: input.reason,
      notes: input.notes?.trim() || null,
      brokerId: lead.brokerId,
      closedById: actor.id,
    },
  });
  await changeLeadStage(leadId, STAGE_AFTER_ACTION.LOSE, actor.id);
}

/** Lead perdido voltou: anula a perda (sai dos indicadores) e volta para atendimento. */
export async function reopenLead(leadId: string, actor: Actor) {
  await assertAllowed(leadId, 'REOPEN', actor);
  await voidLatest(leadId, 'LOST', actor.id);
  await changeLeadStage(leadId, STAGE_AFTER_ACTION.REOPEN, actor.id);
}

/** Venda registrada por engano (só o dono): anula e volta para negociação. */
export async function undoWin(leadId: string, actor: Actor) {
  await assertAllowed(leadId, 'UNDO_WIN', actor);
  await voidLatest(leadId, 'WON', actor.id);
  await changeLeadStage(leadId, STAGE_AFTER_ACTION.UNDO_WIN, actor.id);
}

async function voidLatest(leadId: string, result: 'WON' | 'LOST', userId: string) {
  const deal = await prisma.deal.findFirst({
    where: { leadId, result, voidedAt: null },
    orderBy: { closedAt: 'desc' },
    select: { id: true },
  });
  if (deal) await prisma.deal.update({ where: { id: deal.id }, data: { voidedAt: new Date(), voidedById: userId } });
}
