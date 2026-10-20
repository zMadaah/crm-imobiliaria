import { Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, apiFetch } from '../lib/api';
import { addDays, combineLocal, toDateInput, toTimeInput } from '../lib/dates';
import { displayName, formatPhone } from '../lib/labels';
import type { LeadDetail, LeadListItem, Visit } from '../lib/types';
import { Dialog } from './Dialog';

type Props = {
  presetLeadId?: string;
  initialStart?: Date;
  onClose: () => void;
  onCreated: (visit: Visit, clientNotified: boolean) => void;
};

const DURATIONS = [30, 45, 60, 90, 120];

function defaultStart(): Date {
  const date = addDays(new Date(), 1);
  date.setHours(10, 0, 0, 0);
  return date;
}

export function VisitForm({ presetLeadId, initialStart, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const start = initialStart ?? defaultStart();

  const [leadId, setLeadId] = useState(presetLeadId ?? '');
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [brokerId, setBrokerId] = useState('');
  const [date, setDate] = useState(toDateInput(start));
  const [time, setTime] = useState(toTimeInput(start));
  const [duration, setDuration] = useState(60);
  const [reference, setReference] = useState('');
  const [notifyClient, setNotifyClient] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      return;
    }
    apiFetch<LeadDetail>(`/leads/${leadId}`)
      .then((data) => {
        setLead(data);
        setReference(data.originSource === 'REF_CODE' ? (data.originPost ?? '') : '');
        setNotifyClient(data.serviceWindow.open);
      })
      .catch(() => setError('Não foi possível carregar o lead.'));
  }, [leadId]);

  useEffect(() => {
    if (user?.role !== 'OWNER') return;
    apiFetch<{ items: { id: string; name: string }[] }>('/visits/brokers')
      .then(({ items }) => setBrokers(items))
      .catch(() => undefined);
  }, [user?.role]);

  const needsBroker = Boolean(lead && !lead.broker);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = combineLocal(date, time);
    if (!lead || !startsAt) {
      setError('Escolha o lead, a data e a hora.');
      return;
    }
    if (needsBroker && !brokerId) {
      setError('Escolha o corretor que vai fazer a visita.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ visit: Visit; clientNotified: boolean }>('/visits', {
        method: 'POST',
        body: JSON.stringify({
          leadId: lead.id,
          brokerId: needsBroker ? brokerId : undefined,
          startsAt,
          durationMinutes: duration,
          propertyReference: reference || null,
          notifyClient: lead.serviceWindow.open && notifyClient,
        }),
      });
      onCreated(result.visit, result.clientNotified);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível agendar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-pine';

  return (
    <Dialog title="Agendar visita" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {presetLeadId ? (
          lead && (
            <p>
              <span className="font-semibold">{displayName(lead)}</span>
              <span className="text-muted">, {formatPhone(lead.phone)}</span>
            </p>
          )
        ) : (
          <LeadPicker selectedId={leadId} onSelect={setLeadId} />
        )}

        {lead && (
          <>
            {needsBroker ? (
              <label className="block text-sm font-medium">
                Corretor
                <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)} className={field}>
                  <option value="">Escolha o corretor</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block font-normal text-muted">O lead passa a ser deste corretor.</span>
              </label>
            ) : (
              <p className="text-sm text-muted">Corretor: {lead.broker?.name}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Data
                <input type="date" required value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-medium">
                Hora
                <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field} />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Duração
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field}>
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} minutos` : minutes === 60 ? '1 hora' : `${minutes / 60} horas`.replace('.5', ',5')}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium">
              Imóvel
              <input
                type="text"
                value={reference}
                maxLength={120}
                placeholder="Código ou endereço"
                onChange={(e) => setReference(e.target.value)}
                className={field}
              />
            </label>

            {lead.serviceWindow.open ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} className="mt-0.5 accent-pine" />
                Avisar o cliente pelo WhatsApp com data, hora e imóvel
              </label>
            ) : (
              <p className="text-sm text-muted">
                O cliente não pode ser avisado pelo WhatsApp agora: a última mensagem dele foi há mais de 24 horas.
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !lead}
            className="rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-dark disabled:opacity-50"
          >
            {saving ? 'Agendando…' : 'Agendar visita'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function LeadPicker({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LeadListItem[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      apiFetch<{ items: LeadListItem[] }>(`/leads${qs}`)
        .then(({ items }) => setResults(items.slice(0, 6)))
        .catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <fieldset>
      <legend className="text-sm font-medium">Lead</legend>
      <div className="relative mt-1">
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          aria-label="Buscar lead por nome ou telefone"
          placeholder="Nome ou telefone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-line bg-surface py-2 pl-8 pr-3 outline-none focus:border-pine"
        />
      </div>
      <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-line">
        {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhum lead encontrado.</li>}
        {results.map((lead) => (
          <li key={lead.id}>
            <label className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-paper ${selectedId === lead.id ? 'bg-pine-soft' : ''}`}>
              <input type="radio" name="lead" checked={selectedId === lead.id} onChange={() => onSelect(lead.id)} className="accent-pine" />
              <span className="font-medium">{displayName(lead)}</span>
              {lead.name && <span className="text-muted">{formatPhone(lead.phone)}</span>}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
