/**
 * Base de conferência dos indicadores: dados escolhidos a dedo, em março de 2001
 * (longe de qualquer dado real), com o resultado esperado calculado à mão.
 * Usada por scripts/check-indicators.ts dentro de uma transação desfeita no fim.
 */
import type { Indicators } from './indicators.queries';

export const FIXTURE_PERIOD = {
  start: new Date('2001-03-01T00:00:00-03:00'),
  end: new Date('2001-04-01T00:00:00-03:00'),
};

const B1 = 'f0000000-0000-4000-8000-0000000000b1';
const B2 = 'f0000000-0000-4000-8000-0000000000b2';
const lead = (n: number) => `f0000000-0000-4000-8000-00000000010${n}`;

const leads: [number, string, string | null, string | null, string, string | null][] = [
  // n, chegou em (Brasília), temperatura, origem, tipo da origem, corretor
  [1, '2001-03-05 10:00', 'HOT', 'REF-900', 'REF_CODE', B1],
  [2, '2001-03-06 10:00', 'HOT', 'REF-900', 'REF_CODE', B1],
  [3, '2001-03-07 10:00', 'WARM', 'AD-777', 'CTWA_AD', B2],
  [4, '2001-03-08 10:00', 'COLD', null, 'UNKNOWN', null],
  [5, '2001-03-09 10:00', null, null, 'UNKNOWN', B2],
  [6, '2001-03-31 23:30', 'WARM', 'AD-777', 'CTWA_AD', B2], // último minuto do período: entra
  [7, '2001-04-01 00:00', 'HOT', 'REF-900', 'REF_CODE', B1], // fim é exclusivo: fica fora
  [8, '2001-02-28 23:59', 'WARM', 'REF-900', 'REF_CODE', B2], // antes do período: fica fora
  [9, '2001-03-10 10:00', 'COLD', 'AD-555 (Torre B)', 'CTWA_AD', B2], // anúncio cadastrado com nome
];

/** Lead 9 veio do anúncio 555, que o dono nomeou no painel. */
const AD_OF_LEAD: Record<number, string> = { 9: '555' };

const visits: [number, string, string, string][] = [
  // lead, corretor, início (Brasília), status
  [1, B1, '2001-03-06 10:00', 'DONE'],
  [2, B1, '2001-03-07 10:00', 'RESCHEDULED'],
  [2, B1, '2001-03-08 10:00', 'DONE'],
  [3, B2, '2001-03-09 10:00', 'NO_SHOW'],
  [6, B2, '2001-04-02 10:00', 'SCHEDULED'], // lead do período, visita fora dele
  [7, B1, '2001-03-30 10:00', 'DONE'], // lead fora do período, visita dentro
  [8, B2, '2001-02-27 10:00', 'DONE'], // tudo fora
];

const deals: [number, string, string | null, string | null, string | null, string, string | null, boolean][] = [
  // lead, resultado, tipo, valor, motivo, fechado em (Brasília), corretor, anulado
  [1, 'WON', 'SALE', '500000.00', null, '2001-03-10 12:00', B1, false],
  [2, 'WON', 'RENT', '3500.00', null, '2001-03-12 12:00', B1, false],
  [3, 'LOST', null, null, 'PRICE', '2001-03-15 12:00', B2, false],
  [4, 'LOST', null, null, 'FINANCING_DENIED', '2001-03-05 12:00', null, true], // anulado: fora
  [4, 'LOST', null, null, 'NO_RESPONSE', '2001-03-20 12:00', null, false],
  [5, 'WON', 'SALE', '250000.00', null, '2001-03-25 12:00', B2, true], // venda desfeita: fora
  [7, 'WON', 'SALE', '999.00', null, '2001-03-28 12:00', B1, false], // lead de abril, venda de março
  [8, 'LOST', null, null, 'GAVE_UP', '2001-03-02 12:00', B2, false], // lead de fevereiro, perda de março
];

const q = (value: string | null) => (value === null ? 'NULL' : `'${value}'`);
const brt = (local: string) => `'${local}-03'`;

export const FIXTURE_STATEMENTS: string[] = [
  `INSERT INTO users (id, name, email, password_hash, role, updated_at) VALUES
    ('${B1}', 'Conferência Corretor A', 'conferencia-a@teste.local', 'x', 'BROKER', now()),
    ('${B2}', 'Conferência Corretor B', 'conferencia-b@teste.local', 'x', 'BROKER', now())`,
  `INSERT INTO ads (id, ad_id, headline, name, updated_at) VALUES
    (gen_random_uuid(), '555', 'Torre B', 'Apto 2 quartos Torre B', now())`,
  `INSERT INTO leads (id, phone, temperature, origin_post, origin_source, origin_ad_id, broker_id, created_at, updated_at) VALUES ${leads
    .map(([n, at, temp, origin, source, broker]) => `('${lead(n)}', '550000000000${n}', ${temp ? `'${temp}'` : 'NULL'}, ${q(origin)}, '${source}', ${q(AD_OF_LEAD[n] ?? null)}, ${q(broker)}, ${brt(at)}, now())`)
    .join(', ')}`,
  `INSERT INTO visits (id, lead_id, broker_id, scheduled_at, ends_at, status, updated_at) VALUES ${visits
    .map(([n, broker, at, status]) => `(gen_random_uuid(), '${lead(n)}', '${broker}', ${brt(at)}, ${brt(at)}::timestamptz + interval '1 hour', '${status}', now())`)
    .join(', ')}`,
  `INSERT INTO deals (id, lead_id, result, kind, value, loss_reason, closed_at, broker_id, voided_at) VALUES ${deals
    .map(([n, result, kind, value, reason, at, broker, voided]) => `(gen_random_uuid(), '${lead(n)}', '${result}', '${kind ?? 'SALE'}', ${value ?? 'NULL'}, ${q(reason)}, ${brt(at)}, ${q(broker)}, ${voided ? 'now()' : 'NULL'})`)
    .join(', ')}`,
];

/** Resultado esperado, calculado à mão a partir das tabelas acima. */
export const EXPECTED: Indicators = {
  temperature: { HOT: 2, WARM: 2, COLD: 2, NONE: 1 }, // leads 1 a 6 e 9
  funnel: { leads: 7, withVisit: 4, visited: 2, won: 2 }, // visita: 1,2,3,6; realizada: 1,2; fechou: 1,2
  noShow: { done: 3, noShow: 1, rate: 0.25 }, // visitas de março: 3 realizadas, 1 falta (remarcada fora)
  byBroker: [{ brokerId: B1, brokerName: 'Conferência Corretor A', sales: 2, salesValue: '500999.00', rentals: 1, rentalsValue: '3500.00' }],
  totals: { sales: 2, salesValue: '500999.00', rentals: 1, rentalsValue: '3500.00' },
  byOrigin: [
    { origin: 'AD-777', originSource: 'CTWA_AD', leads: 2, won: 0, salesValue: '0.00', rentalsValue: '0.00' },
    { origin: 'Anúncio: Apto 2 quartos Torre B', originSource: 'CTWA_AD', leads: 1, won: 0, salesValue: '0.00', rentalsValue: '0.00' },
    { origin: 'Não identificada', originSource: 'UNKNOWN', leads: 2, won: 0, salesValue: '0.00', rentalsValue: '0.00' },
    { origin: 'REF-900', originSource: 'REF_CODE', leads: 2, won: 2, salesValue: '500000.00', rentalsValue: '3500.00' },
  ],
  lossReasons: [
    { reason: 'GAVE_UP', losses: 1 },
    { reason: 'NO_RESPONSE', losses: 1 },
    { reason: 'PRICE', losses: 1 },
  ],
};

export type CheckResult = { name: string; ok: boolean; expected: unknown; actual: unknown };

/** Compara indicador por indicador. Listas comparadas sem depender de ordem de empate. */
export function compareIndicators(actual: Indicators, expected: Indicators = EXPECTED): CheckResult[] {
  const sortBy = <T>(list: T[], key: (item: T) => string) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
  const pairs: [string, unknown, unknown][] = [
    ['Leads por temperatura', actual.temperature, expected.temperature],
    ['Funil', actual.funnel, expected.funnel],
    ['Não comparecimento', actual.noShow, expected.noShow],
    ['Vendas por corretor', sortBy(actual.byBroker, (b) => b.brokerName ?? ''), sortBy(expected.byBroker, (b) => b.brokerName ?? '')],
    ['Totais', actual.totals, expected.totals],
    ['Leads por origem', sortBy(actual.byOrigin, (o) => o.origin), sortBy(expected.byOrigin, (o) => o.origin)],
    ['Motivos de perda', sortBy(actual.lossReasons, (r) => r.reason), sortBy(expected.lossReasons, (r) => r.reason)],
  ];
  return pairs.map(([name, a, e]) => ({ name, ok: JSON.stringify(a) === JSON.stringify(e), expected: e, actual: a }));
}
