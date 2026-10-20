import { X } from 'lucide-react';
import { NotificationIcon } from './NotificationIcon';
import { useNotificationsContext } from './NotificationsProvider';

/** Aviso imediato de uma notificação nova (lead quente, visita marcada), com a página aberta. */
export function HotLeadToast() {
  const { toast, dismissToast } = useNotificationsContext();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-16 z-30 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border-l-4 bg-surface p-4 shadow-[0_16px_40px_-16px_rgba(27,43,46,0.45)] ${
        toast.type === 'HOT_LEAD' ? 'border-hot' : 'border-pine'
      }`}
    >
      <NotificationIcon type={toast.type} size={22} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{toast.title}</p>
        {toast.body && <p className="text-sm text-muted">{toast.body}</p>}
      </div>
      <button type="button" onClick={dismissToast} aria-label="Fechar aviso" className="text-muted hover:text-ink">
        <X size={18} />
      </button>
    </div>
  );
}
