/** Utilitários de data para a agenda (horário local do navegador). */

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // semana começa na segunda
  d.setDate(d.getDate() - diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Valor para <input type="date"> */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Valor para <input type="time"> */
export function toTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Junta data e hora locais num ISO; null se incompleto. */
export function combineLocal(date: string, time: string): string | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const fullDay = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const range = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

export const formatWeekday = (date: Date) => weekday.format(date).replace('.', '');
export const formatDayMonth = (date: Date) => dayMonth.format(date);
export const formatFullDay = (date: Date) => {
  const label = fullDay.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};
export const formatWeekRange = (start: Date) => `${range.format(start)} a ${range.format(addDays(start, 6))}`;
