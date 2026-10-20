-- Consultas dos indicadores do painel do dono.
-- Gerado por "npm run docs:indicators" a partir de src/modules/reports/indicators.queries.ts.
-- Não edite à mão: o painel roda exatamente estas consultas.
--
-- Como usar no psql: defina o período em horário de Brasília e rode o arquivo.
-- O fim é exclusivo: para outubro inteiro, use de 1º de outubro a 1º de novembro.
--
--   \set inicio '2026-10-01 00:00:00-03'
--   \set fim    '2026-11-01 00:00:00-03'
--   \i docs/indicadores.sql

-- Leads por temperatura (leads que chegaram no período)
SELECT COALESCE(temperature::text, 'NONE') AS temperature, COUNT(*)::int AS leads
FROM leads
WHERE created_at >= :'inicio'::timestamptz AND created_at < :'fim'::timestamptz
GROUP BY 1
ORDER BY 1;

-- Funil (leads que chegaram no período e até onde foram, até hoje)
SELECT
  COUNT(*)::int AS leads,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.lead_id = l.id))::int AS with_visit,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM visits v WHERE v.lead_id = l.id AND v.status = 'DONE'))::int AS visited,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.result = 'WON' AND d.voided_at IS NULL
  ))::int AS won
FROM leads l
WHERE l.created_at >= :'inicio'::timestamptz AND l.created_at < :'fim'::timestamptz;

-- Não comparecimento (visitas com data no período; marcadas e remarcadas ficam fora)
SELECT
  COUNT(*) FILTER (WHERE status = 'DONE')::int AS done,
  COUNT(*) FILTER (WHERE status = 'NO_SHOW')::int AS no_show
FROM visits
WHERE scheduled_at >= :'inicio'::timestamptz AND scheduled_at < :'fim'::timestamptz;

-- Vendas e locações por corretor (fechadas no período)
SELECT
  d.broker_id,
  u.name AS broker_name,
  COUNT(*) FILTER (WHERE d.kind = 'SALE')::int AS sales,
  COALESCE(SUM(d.value) FILTER (WHERE d.kind = 'SALE'), 0)::text AS sales_value,
  COUNT(*) FILTER (WHERE d.kind = 'RENT')::int AS rentals,
  COALESCE(SUM(d.value) FILTER (WHERE d.kind = 'RENT'), 0)::text AS rentals_value
FROM deals d
LEFT JOIN users u ON u.id = d.broker_id
WHERE d.result = 'WON' AND d.voided_at IS NULL
  AND d.closed_at >= :'inicio'::timestamptz AND d.closed_at < :'fim'::timestamptz
GROUP BY d.broker_id, u.name
ORDER BY u.name NULLS LAST;

-- Leads e fechamentos por origem (leads que chegaram no período)
SELECT
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
WHERE l.created_at >= :'inicio'::timestamptz AND l.created_at < :'fim'::timestamptz
GROUP BY 1, 2
ORDER BY leads DESC, origin;

-- Motivos de perda (perdas registradas no período)
SELECT loss_reason::text AS reason, COUNT(*)::int AS losses
FROM deals
WHERE result = 'LOST' AND voided_at IS NULL
  AND closed_at >= :'inicio'::timestamptz AND closed_at < :'fim'::timestamptz
GROUP BY 1
ORDER BY losses DESC, reason;
