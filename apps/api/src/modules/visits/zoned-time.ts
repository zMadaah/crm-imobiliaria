/**
 * Conversões de fuso sem bibliotecas externas, usando Intl.
 */
type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Data e hora "de parede" de um instante num fuso. */
export function toLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday],
  };
}

/** Instante (UTC) que corresponde a uma data e hora locais num fuso. */
export function fromLocalParts(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let guess = asUtc;
  // Duas passadas resolvem inclusive dias de mudança de horário de verão.
  for (let i = 0; i < 2; i++) {
    const p = toLocalParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += asUtc - seenAsUtc;
  }
  return new Date(guess);
}

/** Soma dias a uma data local (sem hora). */
export function addLocalDays(local: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}

const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Qui, 02/10 às 14h" ou "Qui, 02/10 às 14h30" (cabe no limite de 24 caracteres da lista do WhatsApp). */
export function formatSlotLabel(date: Date, timeZone: string): string {
  const p = toLocalParts(date, timeZone);
  const time = p.minute === 0 ? `${p.hour}h` : `${p.hour}h${pad(p.minute)}`;
  return `${WEEKDAY_LABEL[p.weekday]}, ${pad(p.day)}/${pad(p.month)} às ${time}`;
}
