import type { Visit } from '../lib/types';

/** Cor da visita pela situação. Vermelho só para o que exige ação: registro pendente. */
export function visitTone(visit: Visit): string {
  if (visit.pending) return 'border-hot bg-hot-soft text-ink';
  switch (visit.status) {
    case 'SCHEDULED':
      return 'border-pine bg-pine-soft text-ink';
    case 'DONE':
      return 'border-muted/50 bg-paper text-muted';
    case 'NO_SHOW':
      return 'border-muted/40 bg-paper text-muted line-through';
    case 'RESCHEDULED':
      return 'border-dashed border-muted/40 bg-transparent text-muted';
  }
}
