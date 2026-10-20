import type { DealKind, LeadStage, LossReason, UserRole } from '@prisma/client';

export const LOSS_REASONS: LossReason[] = ['PRICE', 'FINANCING_DENIED', 'BOUGHT_ELSEWHERE', 'GAVE_UP', 'NO_RESPONSE', 'OTHER'];

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  PRICE: 'Preço',
  FINANCING_DENIED: 'Financiamento negado',
  BOUGHT_ELSEWHERE: 'Comprou com a concorrência',
  GAVE_UP: 'Desistiu',
  NO_RESPONSE: 'Parou de responder',
  OTHER: 'Outro',
};

export type DealAction = 'START_NEGOTIATION' | 'WIN' | 'LOSE' | 'REOPEN' | 'UNDO_WIN';

const BEFORE_CLOSE: LeadStage[] = ['NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_SCHEDULED', 'VISIT_DONE', 'NEGOTIATION'];

/** O que pode ser feito com o lead na etapa atual. Função pura. */
export function allowedDealActions(stage: LeadStage, role: UserRole): DealAction[] {
  const actions: DealAction[] = [];
  if (stage === 'VISIT_DONE') actions.push('START_NEGOTIATION');
  // Pode fechar direto depois da visita, sem passar por negociação.
  if (stage === 'VISIT_DONE' || stage === 'NEGOTIATION') actions.push('WIN');
  // Perda vale em qualquer etapa antes do fechamento: muita gente desiste antes da visita.
  if (BEFORE_CLOSE.includes(stage)) actions.push('LOSE');
  if (stage === 'LOST') actions.push('REOPEN');
  if (stage === 'WON' && role === 'OWNER') actions.push('UNDO_WIN');
  return actions;
}

export const STAGE_AFTER_ACTION: Record<DealAction, LeadStage> = {
  START_NEGOTIATION: 'NEGOTIATION',
  WIN: 'WON',
  LOSE: 'LOST',
  REOPEN: 'IN_SERVICE',
  UNDO_WIN: 'NEGOTIATION',
};

export const MAX_DEAL_VALUE = 100_000_000_000; // cabe em DECIMAL(14,2)
export const MAX_NOTES = 500;

export type WinInput = { value: number; kind: DealKind; propertyReference?: string | null };
export type LossInput = { reason: LossReason; notes?: string | null };

export function validateWin(input: WinInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(input.value) || input.value <= 0) errors.push('Informe um valor maior que zero.');
  else if (input.value >= MAX_DEAL_VALUE) errors.push('Valor alto demais. Confira os zeros.');
  else if (Math.round(input.value * 100) !== input.value * 100) errors.push('Use no máximo dois dígitos de centavos.');
  if (input.kind !== 'SALE' && input.kind !== 'RENT') errors.push('Escolha venda ou locação.');
  if ((input.propertyReference?.length ?? 0) > 120) errors.push('A referência do imóvel pode ter até 120 caracteres.');
  return errors;
}

export function validateLoss(input: LossInput): string[] {
  const errors: string[] = [];
  const notes = input.notes?.trim() ?? '';
  if (!LOSS_REASONS.includes(input.reason)) errors.push('Escolha o motivo da perda.');
  if (input.reason === 'OTHER' && notes.length < 3) errors.push('Explique o motivo em poucas palavras.');
  if (notes.length > MAX_NOTES) errors.push(`A observação pode ter até ${MAX_NOTES} caracteres.`);
  return errors;
}

/** Tipo sugerido do negócio pela resposta do bot (comprar ou alugar). */
export function defaultDealKind(intentAnswer: string | null | undefined): DealKind {
  return intentAnswer === 'rent' ? 'RENT' : 'SALE';
}
