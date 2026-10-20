import { Bell } from 'lucide-react';
import { NotificationIcon } from './NotificationIcon';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatRelative } from './formatDate';
import { useNotificationsContext } from './NotificationsProvider';

export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotificationsContext();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const label = unreadCount > 0 ? `Notificações: ${unreadCount} não lidas` : 'Notificações';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-ink hover:bg-pine-soft"
      >
        <Bell size={20} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-hot px-1 text-xs font-semibold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(27,43,46,0.35)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notificações</p>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-sm text-pine hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Leads quentes e visitas marcadas pelo bot aparecem aqui na hora.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void markRead(item.id);
                      if (item.leadId) {
                        setOpen(false);
                        navigate(`/leads/${item.leadId}`);
                      }
                    }}
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-paper ${item.readAt ? '' : 'bg-hot-soft/50'}`}
                  >
                    <NotificationIcon type={item.type} size={18} />
                    <span className="min-w-0">
                      <span className={`block truncate ${item.readAt ? '' : 'font-semibold'}`}>{item.title}</span>
                      {item.body && <span className="block text-sm text-muted">{item.body}</span>}
                      <span className="block text-xs text-muted">{formatRelative(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/notificacoes"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-3 text-center text-sm text-pine hover:bg-paper"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
