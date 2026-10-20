import { addLocalDays, fromLocalParts, toLocalParts } from '../visits/zoned-time';

export const PERIOD_PRESETS = ['this_month', 'last_7_days', 'last_30_days', 'last_month', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type Period = {
  preset: PeriodPreset;
  /** Primeiro e último dia, no horário local (YYYY-MM-DD) */
  from: string;
  to: string;
  /** Intervalo [start, end) em UTC usado nas consultas */
  start: Date;
  end: Date;
};

export const MAX_PERIOD_DAYS = 366;

type LocalDate = { year: number; month: number; day: number };
const pad = (n: number) => String(n).padStart(2, '0');
const toText = (d: LocalDate) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

function parseDate(text: string | undefined): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return check.getUTCMonth() === date.month - 1 && check.getUTCDate() === date.day ? date : null;
}

const daysBetween = (a: LocalDate, b: LocalDate) =>
  Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);

/**
 * Converte o filtro do painel num intervalo de datas. Dias contados no fuso informado,
 * do início do primeiro ao fim do último. Função pura; lança erro com mensagem para o usuário.
 */
export function resolvePeriod(
  input: { preset?: string; from?: string; to?: string },
  now: Date,
  timeZone: string,
): Period {
  const preset = (input.preset ?? 'this_month') as PeriodPreset;
  if (!PERIOD_PRESETS.includes(preset)) throw new Error('Período inválido.');

  const today = toLocalParts(now, timeZone);
  let first: LocalDate;
  let last: LocalDate;

  switch (preset) {
    case 'this_month':
      first = { year: today.year, month: today.month, day: 1 };
      last = today;
      break;
    case 'last_7_days':
      first = addLocalDays(today, -6);
      last = today;
      break;
    case 'last_30_days':
      first = addLocalDays(today, -29);
      last = today;
      break;
    case 'last_month': {
      const firstOfThisMonth = { year: today.year, month: today.month, day: 1 };
      last = addLocalDays(firstOfThisMonth, -1);
      first = { year: last.year, month: last.month, day: 1 };
      break;
    }
    case 'custom': {
      const from = parseDate(input.from);
      const to = parseDate(input.to);
      if (!from || !to) throw new Error('Informe as duas datas.');
      if (daysBetween(from, to) < 0) throw new Error('A data inicial precisa ser antes da final.');
      if (daysBetween(from, to) >= MAX_PERIOD_DAYS) throw new Error('Escolha um período de até 1 ano.');
      first = from;
      last = to;
      break;
    }
  }

  const dayAfterLast = addLocalDays(last, 1);
  return {
    preset,
    from: toText(first),
    to: toText(last),
    start: fromLocalParts({ ...first, hour: 0, minute: 0 }, timeZone),
    end: fromLocalParts({ ...dayAfterLast, hour: 0, minute: 0 }, timeZone),
  };
}

/** Taxa entre 0 e 1; null quando não há base (evita divisão por zero). */
export function rate(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}
