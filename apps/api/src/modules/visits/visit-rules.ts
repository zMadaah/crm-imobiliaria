import type { LeadStage, VisitStatus } from '@prisma/client';

export type TimeRange = { start: Date; end: Date };

/** Intervalos [início, fim): encostar não é sobrepor. */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Status que ocupam o horário do corretor (mesma regra da trava no banco). */
export const BLOCKING_STATUSES: VisitStatus[] = ['SCHEDULED', 'DONE'];

/** Visita que já terminou e ainda não teve o resultado registrado. */
export function isPendingOutcome(visit: { status: VisitStatus; endsAt: Date }, now: Date = new Date()): boolean {
  return visit.status === 'SCHEDULED' && visit.endsAt.getTime() <= now.getTime();
}

export const MIN_DURATION = 15;
export const MAX_DURATION = 480;
export const MAX_FEEDBACK = 500;

export type OutcomeInput =
  | { status: 'DONE'; feedback?: string | null }
  | { status: 'NO_SHOW'; feedback?: string | null }
  | { status: 'RESCHEDULED'; feedback?: string | null; newStartsAt?: Date | null };

/** Valida o registro do resultado da visita. Devolve a lista de erros (vazia = ok). */
export function validateOutcome(
  visit: { status: VisitStatus; scheduledAt: Date },
  input: OutcomeInput,
  now: Date = new Date(),
): string[] {
  const errors: string[] = [];
  if (visit.status !== 'SCHEDULED') errors.push('Esta visita já teve o resultado registrado.');

  const feedback = input.feedback?.trim() ?? '';
  if (feedback.length > MAX_FEEDBACK) errors.push(`O comentário pode ter até ${MAX_FEEDBACK} caracteres.`);

  if (input.status === 'DONE' || input.status === 'NO_SHOW') {
    if (visit.scheduledAt.getTime() > now.getTime()) errors.push('A visita ainda não começou.');
  }
  if (input.status === 'DONE' && feedback.length < 3) {
    errors.push('Conte em poucas palavras como foi a visita.');
  }
  if (input.status === 'RESCHEDULED') {
    if (!input.newStartsAt) errors.push('Informe a nova data e hora.');
    else if (input.newStartsAt.getTime() <= now.getTime()) errors.push('A nova data precisa ser no futuro.');
  }
  return errors;
}

export type VisitEvent = 'CREATED' | 'DONE' | 'NO_SHOW' | 'RESCHEDULED';

/** Para qual etapa o lead vai quando algo acontece com a visita (null = não muda). */
export function stageAfterVisitEvent(event: VisitEvent, current: LeadStage): LeadStage | null {
  switch (event) {
    case 'CREATED':
    case 'RESCHEDULED':
      return ['NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_DONE'].includes(current) ? 'VISIT_SCHEDULED' : null;
    case 'DONE':
      return ['NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_SCHEDULED'].includes(current) ? 'VISIT_DONE' : null;
    case 'NO_SHOW':
      return current === 'VISIT_SCHEDULED' ? 'IN_SERVICE' : null;
  }
}
