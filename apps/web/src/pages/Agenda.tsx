import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRealtimeEvent } from '../components/NotificationsProvider';
import { VisitDialog } from '../components/VisitDialog';
import { VisitForm } from '../components/VisitForm';
import { WeekCalendar } from '../components/WeekCalendar';
import { ApiError, apiFetch } from '../lib/api';
import { addDays, formatWeekRange, startOfWeek } from '../lib/dates';
import type { Visit } from '../lib/types';

export function Agenda() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [brokerId, setBrokerId] = useState(isOwner ? '' : (user?.id ?? ''));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Visit | null>(null);
  const [creating, setCreating] = useState<{ start?: Date } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    apiFetch<{ items: { id: string; name: string }[] }>('/visits/brokers').then(({ items }) => {
      setBrokers(items);
      setBrokerId((current) => current || items[0]?.id || '');
    });
  }, [isOwner]);

  const load = useCallback(async () => {
    if (!brokerId) return;
    const qs = new URLSearchParams({
      from: weekStart.toISOString(),
      to: addDays(weekStart, 7).toISOString(),
      brokerId,
    });
    try {
      const { items } = await apiFetch<{ items: Visit[] }>(`/visits?${qs.toString()}`);
      setVisits(items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a agenda.');
    }
  }, [brokerId, weekStart]);

  useEffect(() => {
    void load();
    // Recarrega a cada minuto: visitas que terminam passam a "aguardando registro".
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useRealtimeEvent('visit', () => void load());

  function afterChange(message: string) {
    setSelected(null);
    setCreating(null);
    setFlash(message);
    window.setTimeout(() => setFlash(null), 5_000);
    void load();
    window.dispatchEvent(new Event('crm:visits-changed'));
  }

  const iconButton = 'grid size-9 place-items-center rounded-md border border-line bg-surface hover:border-ink/40';

  return (
    <section className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="mt-1 text-muted">
            {isOwner ? 'Visitas por corretor.' : 'Suas visitas.'}
            <span className="hidden md:inline"> Clique num horário vazio para agendar.</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating({})}
          className="flex items-center gap-2 rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-dark"
        >
          <CalendarPlus size={17} aria-hidden />
          Agendar visita
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setWeekStart((d) => addDays(d, -7))} aria-label="Semana anterior" className={iconButton}>
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
          className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:border-ink/40"
        >
          Hoje
        </button>
        <button type="button" onClick={() => setWeekStart((d) => addDays(d, 7))} aria-label="Próxima semana" className={iconButton}>
          <ChevronRight size={18} />
        </button>
        <p className="ml-2 font-semibold" aria-live="polite">
          {formatWeekRange(weekStart)}
        </p>

        {isOwner && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted">Corretor</span>
            <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2.5">
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {flash && (
        <p role="status" className="mt-4 rounded-md bg-pine-soft px-3 py-2 text-sm text-pine-dark">
          {flash}
        </p>
      )}
      {error && <p className="mt-4 text-danger">{error}</p>}

      <div className="mt-4">
        {isOwner && brokers.length === 0 ? (
          <p className="text-muted">Nenhum corretor ativo cadastrado.</p>
        ) : (
          <WeekCalendar
            weekStart={weekStart}
            visits={visits}
            onSelectVisit={setSelected}
            onSelectSlot={(start) => setCreating({ start })}
          />
        )}
      </div>

      {selected && <VisitDialog visit={selected} onClose={() => setSelected(null)} onSaved={() => afterChange('Visita atualizada.')} />}
      {creating && (
        <VisitForm
          initialStart={creating.start}
          onClose={() => setCreating(null)}
          onCreated={(_visit, notified) => afterChange(notified ? 'Visita agendada e cliente avisado pelo WhatsApp.' : 'Visita agendada.')}
        />
      )}
    </section>
  );
}
