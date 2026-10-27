import { useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { formatMoney, LOSS_REASON_OPTIONS, parseMoneyInput } from '../lib/labels';
import type { DealKind, LeadDetail, LossReason } from '../lib/types';
import { Dialog } from './Dialog';

type Open = 'START_NEGOTIATION' | 'WIN' | 'LOSE' | 'REOPEN' | 'UNDO_WIN' | null;

const LABEL: Record<Exclude<Open, null>, string> = {
  START_NEGOTIATION: 'Iniciar negociação',
  WIN: 'Registrar fechamento',
  LOSE: 'Registrar perda',
  REOPEN: 'Reabrir lead',
  UNDO_WIN: 'Desfazer fechamento',
};

/** Botões do cabeçalho do lead: só aparecem os que valem para a etapa atual. */
export function DealActions({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const [open, setOpen] = useState<Open>(null);
  if (lead.actions.length === 0) return null;

  const primary = (action: Exclude<Open, null>) => action === 'WIN' || action === 'START_NEGOTIATION';
  const done = () => {
    setOpen(null);
    onChanged();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {lead.actions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => setOpen(action)}
          className={
            primary(action)
              ? 'rounded-md bg-pine px-3 py-1.5 text-sm font-semibold text-white hover:bg-pine-dark'
              : 'rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:border-ink/40'
          }
        >
          {LABEL[action]}
        </button>
      ))}

      {open === 'WIN' && <WinForm lead={lead} onClose={() => setOpen(null)} onDone={done} />}
      {open === 'LOSE' && <LossForm leadId={lead.id} onClose={() => setOpen(null)} onDone={done} />}
      {open === 'START_NEGOTIATION' && (
        <ConfirmAction
          title="Iniciar negociação"
          text="O lead passa para a etapa Negociação."
          confirm="Iniciar negociação"
          path={`/leads/${lead.id}/deals/negotiation`}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
      {open === 'REOPEN' && (
        <ConfirmAction
          title="Reabrir lead"
          text="A perda registrada fica no histórico, mas sai dos indicadores. O lead volta para Em atendimento."
          confirm="Reabrir lead"
          path={`/leads/${lead.id}/deals/reopen`}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
      {open === 'UNDO_WIN' && (
        <ConfirmAction
          title="Desfazer fechamento"
          text="Use quando o fechamento foi registrado por engano. Ele fica no histórico como anulado, sai dos indicadores, e o lead volta para Negociação."
          confirm="Desfazer fechamento"
          danger
          path={`/leads/${lead.id}/deals/undo-win`}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      )}
    </div>
  );
}

const field = 'mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 outline-none focus:border-pine';

function FormButtons({ saving, label, onClose, danger = false }: { saving: boolean; label: string; onClose: () => void; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={saving}
        className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-danger hover:opacity-90' : 'bg-pine hover:bg-pine-dark'}`}
      >
        {saving ? 'Salvando…' : label}
      </button>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(path: string, body?: unknown) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, setError, submit };
}

function WinForm({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<DealKind>(lead.defaultDealKind);
  const [valueText, setValueText] = useState('');
  const lastVisitReference = lead.visits.find((v) => v.propertyReference)?.propertyReference;
  const [reference, setReference] = useState(lastVisitReference ?? lead.propertyReference ?? '');
  const { saving, error, setError, submit } = useSubmit(onDone);
  const value = parseMoneyInput(valueText);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (value === null || value <= 0) {
      setError('Informe o valor, por exemplo 450.000 ou 3.500,00.');
      return;
    }
    void submit(`/leads/${lead.id}/deals/won`, { kind, value, propertyReference: reference || null });
  }

  return (
    <Dialog title="Registrar fechamento" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium">Tipo de negócio</legend>
          <div className="mt-2 flex gap-4">
            {(['SALE', 'RENT'] as const).map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input type="radio" name="kind" checked={kind === option} onChange={() => setKind(option)} className="accent-pine" />
                {option === 'SALE' ? 'Venda' : 'Locação'}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-medium">
          {kind === 'SALE' ? 'Valor da venda' : 'Aluguel mensal'}
          <input
            type="text"
            inputMode="decimal"
            required
            autoFocus
            placeholder={kind === 'SALE' ? '450.000,00' : '3.500,00'}
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            className={`tabular ${field}`}
          />
          {value !== null && value > 0 && <span className="mt-1 block font-normal text-muted">{formatMoney(value)}</span>}
        </label>

        <label className="block text-sm font-medium">
          Imóvel
          <input type="text" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Código ou endereço" className={field} />
        </label>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <FormButtons saving={saving} label={kind === 'SALE' ? 'Registrar venda' : 'Registrar locação'} onClose={onClose} />
      </form>
    </Dialog>
  );
}

function LossForm({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<LossReason | ''>('');
  const [notes, setNotes] = useState('');
  const { saving, error, setError, submit } = useSubmit(onDone);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError('Escolha o motivo da perda.');
      return;
    }
    if (reason === 'OTHER' && notes.trim().length < 3) {
      setError('Explique o motivo em poucas palavras.');
      return;
    }
    void submit(`/leads/${leadId}/deals/lost`, { reason, notes: notes || null });
  }

  return (
    <Dialog title="Registrar perda" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset>
          <legend className="text-sm font-medium">Por que o negócio não aconteceu?</legend>
          <div className="mt-2 space-y-1.5">
            {LOSS_REASON_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2">
                <input type="radio" name="reason" checked={reason === option.value} onChange={() => setReason(option.value)} className="accent-pine" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          {reason === 'OTHER' ? 'Qual foi o motivo?' : 'Observação (opcional)'}
          <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <FormButtons saving={saving} label="Registrar perda" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function ConfirmAction(props: {
  title: string;
  text: string;
  confirm: string;
  path: string;
  danger?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { saving, error, submit } = useSubmit(props.onDone);
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(props.path);
        }}
        className="space-y-4"
      >
        <p>{props.text}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <FormButtons saving={saving} label={props.confirm} onClose={props.onClose} danger={props.danger} />
      </form>
    </Dialog>
  );
}
