import { CalendarCheck, Flame } from 'lucide-react';

export function NotificationIcon({ type, size, muted = false }: { type: string; size: number; muted?: boolean }) {
  if (type === 'VISIT_BOOKED') {
    return <CalendarCheck size={size} className={`mt-0.5 shrink-0 ${muted ? 'text-muted' : 'text-pine'}`} aria-hidden />;
  }
  return <Flame size={size} className={`mt-0.5 shrink-0 ${muted ? 'text-muted' : 'text-hot'}`} aria-hidden />;
}
