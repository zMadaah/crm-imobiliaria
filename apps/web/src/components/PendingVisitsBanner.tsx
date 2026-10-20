import { AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import type { Visit } from '../lib/types';
import { Dialog } from './Dialog';
import { useRealtimeEvent } from './NotificationsProvider';
import { VisitCard } from './WeekCalendar';
import { VisitDialog } from './VisitDialog';

/** Aviso fixo enquanto houver visita que já terminou sem resultado registrado. */
export function PendingVisitsBanner() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Visit[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [selected, setSelected] = useState<Visit | null>(null);

  const load = useCallback(() => {
    apiFetch<{ items: Visit[] }>('/visits/pending')
      .then(({ items }) => setPending(items ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener('crm:visits-changed', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('crm:visits-changed', load);
    };
  }, [load]);

  useRealtimeEvent('visit', load);

  if (pending.length === 0) return null;

  const count = pending.length;
  const own = user?.role !== 'OWNER';
  const text = own
    ? `Você tem ${count} ${count === 1 ? 'visita aguardando' : 'visitas aguardando'} registro.`
    : `${count} ${count === 1 ? 'visita da equipe aguardando' : 'visitas da equipe aguardando'} registro.`;

  return (
    <>
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hot/30 bg-hot-soft px-5 py-2.5 text-sm md:px-10">
        <AlertCircle size={18} className="shrink-0 text-hot" aria-hidden />
        <p className="font-medium">{text}</p>
        <button
          type="button"
          onClick={() => (count === 1 ? setSelected(pending[0]) : setListOpen(true))}
          className="font-semibold text-hot underline-offset-2 hover:underline"
        >
          Registrar agora
        </button>
      </div>

      {listOpen && (
        <Dialog title="Visitas aguardando registro" onClose={() => setListOpen(false)}>
          <ul className="space-y-2">
            {pending.map((visit) => (
              <li key={visit.id}>
                <VisitCard
                  visit={visit}
                  onClick={() => {
                    setListOpen(false);
                    setSelected(visit);
                  }}
                />
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {selected && (
        <VisitDialog
          visit={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            load();
            window.dispatchEvent(new Event('crm:visits-changed'));
          }}
        />
      )}
    </>
  );
}
