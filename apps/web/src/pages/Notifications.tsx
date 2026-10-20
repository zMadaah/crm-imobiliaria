import { Link } from 'react-router-dom';
import { formatRelative } from '../components/formatDate';
import { NotificationIcon } from '../components/NotificationIcon';
import { useNotificationsContext } from '../components/NotificationsProvider';

export function Notifications() {
  const { items, unreadCount, markRead, markAllRead } = useNotificationsContext();

  return (
    <section className="max-w-2xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="mt-1 text-muted">
            {unreadCount > 0 ? `${unreadCount} não lidas` : 'Tudo lido por aqui.'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={() => void markAllRead()} className="text-sm text-pine hover:underline">
            Marcar todas como lidas
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-10 max-w-md text-muted">
          Quando um cliente for classificado como quente ou o bot marcar uma visita para você, o aviso aparece aqui e
          no sino, sem precisar recarregar a página.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 py-4">
              <NotificationIcon type={item.type} size={20} muted={Boolean(item.readAt)} />
              <div className="min-w-0 flex-1">
                {item.leadId ? (
                  <Link
                    to={`/leads/${item.leadId}`}
                    onClick={() => void markRead(item.id)}
                    className={`hover:underline ${item.readAt ? '' : 'font-semibold'}`}
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className={item.readAt ? '' : 'font-semibold'}>{item.title}</p>
                )}
                {item.body && <p className="text-sm text-muted">{item.body}</p>}
                <p className="mt-1 text-xs text-muted">{formatRelative(item.createdAt)}</p>
              </div>
              {!item.readAt && (
                <button
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className="self-start text-sm text-pine hover:underline"
                >
                  Marcar como lida
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
