/**
 * Consultas dos indicadores. $1 = início, $2 = fim do período ([início, fim), em UTC).
 * O arquivo docs/indicadores.sql é gerado a partir daqui (npm run docs:indicators),
 * então o que o painel mostra é exatamente o que se confere no psql.
 */
import { rate } from './period';

export const INDICATOR_QUERIES = {
  temperature: {
    title: 'Leads por temperatura (leads que chegaram no período)',
    sql: `SELECT COALESCE(temperature::text, 'NONE') AS temperature, COUNT(*)::int AS leads
FROM leads
WHERE created_at >= $1 AND created_at < $2
GROUP BY 1
ORDER BY 1`,
  },

  funnel: {
    title: 'Funil (leads que chegaram no período e até onde foram, até hoje)',
    sql: `SELECT
  COUNT(*)::int AS leads,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.lead_id = l.id))::int AS with_visit,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.lead_id = l.id AND v.status = 'DONE'))::int AS visited,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.result = 'WON' AND d.voided_at IS NULL
  ))::int AS won
FROM leads l
WHERE l.created_at >= $1 AND l.created_at < $2`,
  },

  noShow: {
    title: 'Não comparecimento (visitas com data no período; marcadas e remarcadas ficam fora)',
    sql: `SELECT
  COUNT(*) FILTER (WHERE status = 'DONE')::int AS done,
  COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show
FROM visits
WHERE scheduled_at >= $1 AND scheduled_at < $2`,
  },

  byBroker: {
    title: 'Vendas e locações por corretor (fechadas no período)',
    sql: `SELECT
  d.broker_id,
  u.name AS broker_name,
  COUNT(*) FILTER (WHERE d.kind = 'SALE')::int AS sales,
  COALESCE(SUM(d.value) FILTER (WHERE d.kind = 'SALE'), 0)::text AS sales_value,
  COUNT(*) FILTER (WHERE d.kind = 'RENT')::int AS rentals,
  COALESCE(SUM(d.value) FILTER (WHERE d.kind = 'RENT'), 0)::text AS rentals_value
FROM deals d
LEFT JOIN users u ON u.id = d.broker_id
WHERE d.result = 'WON' AND d.voided_at IS NULL
  AND d.closed_at >= $1 AND d.closed_at < $2
GROUP BY d.broker_id, u.name
ORDER BY u.name NULLS LAST`,
  },

  byOrigin: {
    title: 'Leads e fechamentos por origem (leads que chegaram no período)',
    sql: `SELECT
  COALESCE(l.origin_post, 'Não identificada') AS origin,
  l.origin_source::text AS origin_source,
  COUNT(*)::int AS leads,
  COUNT(w.lead_id)::int AS won,
  COALESCE(SUM(w.sales_value), 0)::text AS sales_value,
  COALESCE(SUM(w.rentals_value), 0)::text AS rentals_value
FROM leads l
LEFT JOIN (
  SELECT
    lead_id,
    SUM(value) FILTER (WHERE kind = 'SALE') AS sales_value,
    SUM(value) FILTER (WHERE kind = 'RENT') AS rentals_value
  FROM deals
  WHERE result = 'WON' AND voided_at IS NULL
  GROUP BY lead_id
) w ON w.lead_id = l.id
WHERE l.created_at >= $1 AND l.created_at < $2
GROUP BY 1, 2
ORDER BY leads DESC, origin`,
  },

  lossReasons: {
    title: 'Motivos de perda (perdas registradas no período)',
    sql: `SELECT loss_reason::text AS reason, COUNT(*)::int AS losses
FROM deals
WHERE result = 'LOST' AND voided_at IS NULL
  AND closed_at >= $1 AND closed_at < $2
GROUP BY 1
ORDER BY losses DESC, reason`,
  },
} as const;

export type QueryName = keyof typeof INDICATOR_QUERIES;
type Row = Record<string, unknown>;
export type QueryRunner = (sql: string, params: [Date, Date]) => Promise<Row[]>;

/** Roda as consultas com qualquer cliente (Prisma no app, pg na conferência). */
export async function runIndicatorQueries(
  run: QueryRunner,
  start: Date,
  end: Date,
  options: { sequential?: boolean } = {},
) {
  const names = Object.keys(INDICATOR_QUERIES) as QueryName[];
  const entries: (readonly [QueryName, Row[]])[] = [];
  if (options.sequential) {
    for (const name of names) entries.push([name, await run(INDICATOR_QUERIES[name].sql, [start, end])]);
  } else {
    entries.push(...(await Promise.all(names.map(async (name) => [name, await run(INDICATOR_QUERIES[name].sql, [start, end])] as const))));
  }
  return shapeIndicators(Object.fromEntries(entries) as Record<QueryName, Row[]>);
}

const int = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => (Number(value ?? 0)).toFixed(2);

/** Formato final entregue ao painel. Valores em dinheiro como texto com 2 casas. */
export function shapeIndicators(raw: Record<QueryName, Row[]>) {
  const funnel = raw.funnel[0] ?? {};
  const noShow = raw.noShow[0] ?? {};
  const done = int(noShow.done);
  const noShowCount = int(noShow.no_show);

  const temperature = { HOT: 0, WARM: 0, COLD: 0, NONE: 0 };
  for (const row of raw.temperature) temperature[row.temperature as keyof typeof temperature] = int(row.leads);

  const byBroker = raw.byBroker.map((row) => ({
    brokerId: (row.broker_id as string | null) ?? null,
    brokerName: (row.broker_name as string | null) ?? null,
    sales: int(row.sales),
    salesValue: money(row.sales_value),
    rentals: int(row.rentals),
    rentalsValue: money(row.rentals_value),
  }));

  return {
    temperature,
    funnel: {
      leads: int(funnel.leads),
      withVisit: int(funnel.with_visit),
      visited: int(funnel.visited),
      won: int(funnel.won),
    },
    noShow: { done, noShow: noShowCount, rate: rate(noShowCount, done + noShowCount) },
    byBroker,
    totals: {
      sales: byBroker.reduce((sum, b) => sum + b.sales, 0),
      salesValue: byBroker.reduce((sum, b) => sum + Number(b.salesValue), 0).toFixed(2),
      rentals: byBroker.reduce((sum, b) => sum + b.rentals, 0),
      rentalsValue: byBroker.reduce((sum, b) => sum + Number(b.rentalsValue), 0).toFixed(2),
    },
    byOrigin: raw.byOrigin.map((row) => ({
      origin: row.origin as string,
      originSource: row.origin_source as string,
      leads: int(row.leads),
      won: int(row.won),
      salesValue: money(row.sales_value),
      rentalsValue: money(row.rentals_value),
    })),
    lossReasons: raw.lossReasons.map((row) => ({ reason: row.reason as string, losses: int(row.losses) })),
  };
}

export type Indicators = ReturnType<typeof shapeIndicators>;

/** Conteúdo de docs/indicadores.sql, para conferência manual no psql. */
export function buildIndicatorsSqlDoc(): string {
  const header = `-- Consultas dos indicadores do painel do dono.
-- Gerado por "npm run docs:indicators" a partir de src/modules/reports/indicators.queries.ts.
-- Não edite à mão: o painel roda exatamente estas consultas.
--
-- Como usar no psql: defina o período em horário de Brasília e rode o arquivo.
-- O fim é exclusivo: para outubro inteiro, use de 1º de outubro a 1º de novembro.
--
--   \\set inicio '2026-10-01 00:00:00-03'
--   \\set fim    '2026-11-01 00:00:00-03'
--   \\i docs/indicadores.sql
`;
  const blocks = (Object.keys(INDICATOR_QUERIES) as QueryName[]).map((name) => {
    const { title, sql } = INDICATOR_QUERIES[name];
    const body = sql.replaceAll('$1', ":'inicio'::timestamptz").replaceAll('$2', ":'fim'::timestamptz");
    return `-- ${title}\n${body};\n`;
  });
  return `${header}\n${blocks.join('\n')}`;
}
