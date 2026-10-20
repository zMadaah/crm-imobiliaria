import type { LeadDetail, LeadStage, LossReason, VisitStatus } from './types';

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'Novo',
  QUALIFIED: 'Qualificado',
  IN_SERVICE: 'Em atendimento',
  VISIT_SCHEDULED: 'Visita agendada',
  VISIT_DONE: 'Visita realizada',
  NEGOTIATION: 'Negociação',
  WON: 'Vendido',
  LOST: 'Perdido',
};

export const STAGE_ORDER = Object.keys(STAGE_LABEL) as LeadStage[];

export const BOT_STATUS_LABEL: Record<NonNullable<LeadDetail['botStatus']>, string> = {
  ACTIVE: 'Bot ainda conversando',
  COMPLETED: 'Concluiu o bot',
  HANDED_OFF: 'Pediu um corretor',
  DECLINED: 'Recusou o bot',
};

export function displayName(lead: { name: string | null; phone: string }): string {
  return lead.name?.trim() || formatPhone(lead.phone);
}

/** 5561999998888 → +55 61 99999-8888 */
export function formatPhone(phone: string): string {
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return match ? `+55 ${match[1]} ${match[2]}-${match[3]}` : `+${phone}`;
}

export function originLabel(lead: { originPost: string | null; originSource: string }): string {
  if (!lead.originPost) return 'Origem não identificada';
  return lead.originSource === 'CTWA_AD' ? `Anúncio ${lead.originPost.replace(/^AD-/, '')}` : `Post ${lead.originPost}`;
}

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'Marcada',
  DONE: 'Realizada',
  NO_SHOW: 'Cliente não compareceu',
  RESCHEDULED: 'Remarcada',
};

export const LOSS_REASON_OPTIONS: { value: LossReason; label: string }[] = [
  { value: 'PRICE', label: 'Preço' },
  { value: 'FINANCING_DENIED', label: 'Financiamento negado' },
  { value: 'BOUGHT_ELSEWHERE', label: 'Comprou com a concorrência' },
  { value: 'GAVE_UP', label: 'Desistiu' },
  { value: 'NO_RESPONSE', label: 'Parou de responder' },
  { value: 'OTHER', label: 'Outro' },
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export const formatMoney = (value: string | number) => brl.format(Number(value));
export const formatMoneyCompact = (value: string | number) => brlCompact.format(Number(value));
export const formatPercent = (value: number | null) =>
  value === null ? 'sem dados' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/**
 * Lê valor digitado em reais: "450.000,50", "R$ 450.000", "3.500" ou "450000.50".
 * Ponto seguido de exatamente três dígitos é separador de milhar. Devolve null se inválido.
 */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[R$\s]/g, '').trim();
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, '');
  else normalized = cleaned;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
