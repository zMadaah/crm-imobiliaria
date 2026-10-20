import { useState } from 'react';

export const PRESETS = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_7_days', label: 'Últimos 7 dias' },
  { value: 'last_30_days', label: 'Últimos 30 dias' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'custom', label: 'Escolher datas' },
];

type Value = { preset: string; from?: string; to?: string };

export function PeriodPicker({ value, onChange }: { value: Value; onChange: (value: Value) => void }) {
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');
  const field = 'h-9 rounded-md border border-line bg-surface px-2.5 text-sm';

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="block text-muted">Período</span>
        <select
          value={value.preset}
          onChange={(e) => (e.target.value === 'custom' ? onChange({ preset: 'custom', from, to }) : onChange({ preset: e.target.value }))}
          className={`mt-1 ${field}`}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {value.preset === 'custom' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ preset: 'custom', from, to });
          }}
        >
          <label className="text-sm">
            <span className="block text-muted">De</span>
            <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <label className="text-sm">
            <span className="block text-muted">Até</span>
            <input type="date" required value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${field}`} />
          </label>
          <button type="submit" className="h-9 rounded-md bg-pine px-3 text-sm font-semibold text-white hover:bg-pine-dark">
            Aplicar
          </button>
        </form>
      )}
    </div>
  );
}
