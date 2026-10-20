const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const longDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatRelative(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffMinutes < 24 * 60) return `há ${Math.floor(diffMinutes / 60)} h`;
  return dateTime.format(new Date(iso));
}

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Horário na lista: hoje mostra a hora; antes disso, o dia. */
export function formatListTime(iso: string): string {
  const date = new Date(iso);
  return isSameDay(date, new Date()) ? time.format(date) : shortDate.format(date);
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return 'Hoje';
  if (isSameDay(date, yesterday)) return 'Ontem';
  const label = longDate.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
