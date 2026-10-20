import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../lib/api';
import { addDays, combineLocal, toDateInput, toTimeInput } from '../lib/dates';
import { displayName, VISIT_STATUS_LABEL } from '../lib/labels';
import type { Visit } from '../lib/types';
import { Dialog } from './Dialog';
import { formatDateTime, formatTime } from './formatDate';

type Outcome = 'DONE' | 'NO_SHOW' | 'RESCHEDULED';

/** Detalhes da visita e, se ainda estiver marcada, o registro do resultado. */
export function VisitDialog({ visit, onClose, onSaved }: { visit: Visit; onClose: () => void; onSaved: () => void }) {
  const started = new Date(visit.scheduledAt).getTime() <= Date.now();
  const [outcome, setOutcome] = useState<Outcome | ''>(visit.pending ? '' : started ? '' : 'RESCHEDULED');
  const [feedback, setFeedback] = useState('');
  const nextDay = addDays(new Date(visit.scheduledAt), 1);
  const [date, setDate] = useState(toDateInput(nextDay > new Date() ? nextDay : addDays(new Date(), 1)));
  const [time, setTime] = useState(toTimeInput(new Date(visit.scheduledAt)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!outcome) {
      setError('Escolha como foi a visita.');
      return;
    }
    const newStartsAt = outcome === 'RESCHEDULED' ? combineLocal(date, time) : null;
    if (outcome === 'RESCHEDULED' && !newStartsAt) {
      setError('Informe a nova data e hora.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/visits/${visit.id}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ status: outcome, feedback: feedback || null, ...(newStartsAt ? { newStartsAt } : {}) }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const options: { value: Outcome; label: string; disabled: boolean }[] = [
    { value: 'DONE', label: 'Realizada', disabled: !started },
    { value: 'NO_SHOW', label: 'Cliente não compareceu', disabled: !started },
    { value: 'RESCHEDULED', label: 'Remarcada', disabled: false },
  ];

  const feedbackLabel =
    outcome === 'DONE' ? 'Como foi a visita?' : outcome === 'RESCHEDULED' ? 'Motivo (opcional)' : 'Observação (opcional)';
  const field = 'mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-pine';

  return (
    <Dialog title={visit.pending ? 'Registrar visita' : 'Visita'} onClose={onClose}>
      <div className="space-y-1">
        {visit.lead && (
          <p>
            <Link to={`/leads/${visit.lead.id}`} className="font-semibold text-pine hover:underline">
              {displayName(visit.lead)}
            </Link>
          </p>
        )}
        <p className="text-sm">
          {formatDateTime(visit.scheduledAt)} às {formatTime(visit.endsAt)}, com {visit.broker.name}
        </p>
        {visit.propertyReference && <p className="text-sm text-muted">Imóvel: {visit.propertyReference}</p>}
        <p className="text-sm text-muted">
          {visit.source === 'BOT' ? 'Marcada pelo bot' : 'Marcada pelo painel'}.{' '}
          {visit.status !== 'SCHEDULED' && <>Situação: {VISIT_STATUS_LABEL[visit.status].toLowerCase()}.</>}
        </p>
        {visit.feedback && <p className="rounded-md bg-paper px-3 py-2 text-sm">{visit.feedback}</p>}
      </div>

      {visit.status === 'SCHEDULED' && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-line pt-4">
          <fieldset>
            <legend className="text-sm font-medium">{visit.pending ? 'Como foi?' : 'Mudou alguma coisa?'}</legend>
            <div className="mt-2 space-y-1.5">
              {options.map((option) => (
                <label key={option.value} className={`flex items-center gap-2 ${option.disabled ? 'text-muted' : ''}`}>
                  <input
                    type="radio"
                    name="outcome"
                    value={option.value}
                    checked={outcome === option.value}
                    disabled={option.disabled}
                    onChange={() => setOutcome(option.value)}
                    className="accent-pine"
                  />
                  {option.label}
                  {option.disabled && <span className="text-xs">(depois do horário)</span>}
                </label>
              ))}
            </div>
          </fieldset>

          {outcome === 'RESCHEDULED' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                Nova data
                <input type="date" required value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-medium">
                Nova hora
                <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field} />
              </label>
            </div>
          )}

          {outcome && (
            <label className="block text-sm font-medium">
              {feedbackLabel}
              <textarea
                rows={2}
                maxLength={500}
                required={outcome === 'DONE'}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={outcome === 'DONE' ? 'Ex.: gostou da cozinha, quer voltar com a esposa' : ''}
                className={field}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving || !outcome}
              className="rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-dark disabled:opacity-50"
            >
              {saving ? 'Salvando…' : outcome === 'RESCHEDULED' ? 'Remarcar' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
