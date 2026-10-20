import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PeriodPicker } from '../components/PeriodPicker';
import { ApiError, apiFetch } from '../lib/api';
import { formatMoney, formatMoneyCompact, formatPercent } from '../lib/labels';
import type { Indicators as Data } from '../lib/types';

const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDay = (iso: string) => dateLabel.format(new Date(`${iso}T12:00:00Z`));
const pct = (part: number, total: number) => (total > 0 ? formatPercent(part / total) : 'sem dados');

export function Indicators() {
  const [params, setParams] = useSearchParams();
  const preset = params.get('periodo') ?? 'this_month';
  const from = params.get('de') ?? undefined;
  const to = params.get('ate') ?? undefined;

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (preset === 'custom' && (!from || !to)) return;
    const qs = new URLSearchParams({ preset });
    if (preset === 'custom') {
      qs.set('from', from!);
      qs.set('to', to!);
    }
    try {
      setData(await apiFetch<Data>(`/reports/indicators?${qs.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os indicadores.');
    }
  }, [preset, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function changePeriod(value: { preset: string; from?: string; to?: string }) {
    const next = new URLSearchParams({ periodo: value.preset });
    if (value.preset === 'custom' && value.from && value.to) {
      next.set('de', value.from);
      next.set('ate', value.to);
    }
    setParams(next, { replace: true });
  }

  return (
    <section className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicadores</h1>
          {data && (
            <p className="mt-1 text-muted">
              De {fmtDay(data.period.from)} a {fmtDay(data.period.to)}, horário de Brasília.
            </p>
          )}
        </div>
        <PeriodPicker value={{ preset, from, to }} onChange={changePeriod} />
      </div>

      {error && <p className="mt-6 text-danger">{error}</p>}
      {!data && !error && <p className="mt-10 text-muted">{preset === 'custom' ? 'Escolha as datas e clique em Aplicar.' : 'Carregando…'}</p>}
      {data && <Dashboard data={data} />}
    </section>
  );
}

function Dashboard({ data }: { data: Data }) {
  const { funnel, noShow, totals } = data;
  const temperatureTotal = data.temperature.HOT + data.temperature.WARM + data.temperature.COLD + data.temperature.NONE;

  return (
    <div className="mt-8 space-y-12">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-4">
        <Summary label="Leads que chegaram" value={String(funnel.leads)} />
        <Summary label="Vendas fechadas" value={String(totals.sales)} detail={formatMoney(totals.salesValue)} />
        <Summary label="Locações fechadas" value={String(totals.rentals)} detail={`${formatMoney(totals.rentalsValue)} ao mês`} />
        <Summary label="Não comparecimento" value={formatPercent(noShow.rate)} detail={`${noShow.noShow} de ${noShow.done + noShow.noShow} visitas`} />
      </dl>

      <Block
        title="Funil"
        note="Dos leads que chegaram no período, até onde cada um foi, contando até hoje."
        chart={
          <HBarChart
            data={[
              { name: 'Chegaram', value: funnel.leads },
              { name: 'Visita marcada', value: funnel.withVisit },
              { name: 'Visitaram', value: funnel.visited },
              { name: 'Fecharam negócio', value: funnel.won },
            ]}
            color="var(--color-pine)"
          />
        }
      >
        <Table
          head={['Etapa', 'Leads', 'Do total']}
          rows={[
            ['Chegaram', funnel.leads, pct(funnel.leads, funnel.leads)],
            ['Visita marcada', funnel.withVisit, pct(funnel.withVisit, funnel.leads)],
            ['Visitaram', funnel.visited, pct(funnel.visited, funnel.leads)],
            ['Fecharam negócio', funnel.won, pct(funnel.won, funnel.leads)],
          ]}
        />
      </Block>

      <Block
        title="Leads por temperatura"
        note="Leads que chegaram no período."
        chart={
          <HBarChart
            data={[
              { name: 'Quentes', value: data.temperature.HOT, color: 'var(--color-hot)' },
              { name: 'Mornos', value: data.temperature.WARM, color: 'var(--color-warm)' },
              { name: 'Frios', value: data.temperature.COLD, color: 'var(--color-cold)' },
              { name: 'Sem nota', value: data.temperature.NONE, color: 'var(--color-muted)' },
            ]}
          />
        }
      >
        <Table
          head={['Temperatura', 'Leads', 'Do total']}
          rows={[
            ['Quentes', data.temperature.HOT, pct(data.temperature.HOT, temperatureTotal)],
            ['Mornos', data.temperature.WARM, pct(data.temperature.WARM, temperatureTotal)],
            ['Frios', data.temperature.COLD, pct(data.temperature.COLD, temperatureTotal)],
            ['Sem nota', data.temperature.NONE, pct(data.temperature.NONE, temperatureTotal)],
          ]}
        />
      </Block>

      <Block
        title="Fechamentos por corretor"
        note="Negócios fechados no período, não importa quando o lead chegou. Locação em aluguel mensal."
        chart={
          data.byBroker.length > 0 && (
            <HBarChart
              data={data.byBroker.map((b) => ({ name: b.brokerName ?? 'Sem corretor', value: Number(b.salesValue) }))}
              color="var(--color-pine)"
              money
            />
          )
        }
      >
        <Table
          head={['Corretor', 'Vendas', 'Valor em vendas', 'Locações', 'Aluguel mensal']}
          rows={data.byBroker.map((b) => [b.brokerName ?? 'Sem corretor', b.sales, formatMoney(b.salesValue), b.rentals, formatMoney(b.rentalsValue)])}
          foot={['Total', totals.sales, formatMoney(totals.salesValue), totals.rentals, formatMoney(totals.rentalsValue)]}
          empty="Nenhum corretor ativo."
        />
      </Block>

      <Block title="Origem dos leads" note="Leads que chegaram no período, por post ou anúncio, e quantos fecharam negócio até hoje.">
        <Table
          head={['Origem', 'Leads', 'Fecharam', 'Conversão', 'Vendas', 'Aluguel mensal']}
          rows={data.byOrigin.map((o) => [
            o.originSource === 'CTWA_AD' ? `Anúncio ${o.origin.replace(/^AD-/, '')}` : o.origin,
            o.leads,
            o.won,
            pct(o.won, o.leads),
            formatMoney(o.salesValue),
            formatMoney(o.rentalsValue),
          ])}
          empty="Nenhum lead chegou no período."
        />
      </Block>

      <Block
        title="Motivos de perda"
        note="Perdas registradas no período."
        chart={
          data.lossReasons.length > 0 && (
            <HBarChart data={data.lossReasons.map((r) => ({ name: r.label, value: r.losses }))} color="var(--color-muted)" />
          )
        }
      >
        <Table
          head={['Motivo', 'Perdas', 'Do total']}
          rows={(() => {
            const total = data.lossReasons.reduce((sum, r) => sum + r.losses, 0);
            return data.lossReasons.map((r) => [r.label, r.losses, pct(r.losses, total)]);
          })()}
          empty="Nenhuma perda registrada no período."
        />
      </Block>
    </div>
  );
}

function Summary({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-bold tracking-tight">{value}</dd>
      {detail && <dd className="tabular text-sm text-muted">{detail}</dd>}
    </div>
  );
}

function Block({ title, note, chart, children }: { title: string; note: string; chart?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted">{note}</p>
      <div className={`mt-4 grid gap-6 ${chart ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        {chart && <div aria-hidden>{chart}</div>}
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Table({ head, rows, foot, empty }: { head: string[]; rows: (string | number)[][]; foot?: (string | number)[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`py-2 pr-4 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="py-2 pr-4 text-left font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="tabular py-2 pr-4 text-right">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-ink/20 font-semibold">
              {foot.map((cell, i) => (
                <td key={i} className={`tabular py-2 pr-4 ${i > 0 ? 'text-right' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type BarDatum = { name: string; value: number; color?: string };

function HBarChart({ data, color, money = false }: { data: BarDatum[]; color?: string; money?: boolean }) {
  const format = (v: number) => (money ? formatMoneyCompact(v) : String(v));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: money ? 96 : 48, bottom: 0, left: 0 }}>
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-ink)', fontSize: 13 }} />
        <Tooltip cursor={{ fill: 'var(--color-pine-soft)' }} formatter={(v) => format(Number(v))} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={22}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color ?? color} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v: unknown) => format(Number(v))} style={{ fill: 'var(--color-ink)', fontSize: 13 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
