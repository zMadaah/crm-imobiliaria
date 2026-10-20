import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowedDealActions, defaultDealKind, validateLoss, validateWin } from '../modules/deals/deal-rules';
import { EXPECTED } from '../modules/reports/indicator-fixture';
import { buildIndicatorsSqlDoc, shapeIndicators } from '../modules/reports/indicators.queries';
import { rate, resolvePeriod } from '../modules/reports/period';

describe('allowedDealActions', () => {
  it.each([
    ['NEW', 'BROKER', ['LOSE']],
    ['IN_SERVICE', 'BROKER', ['LOSE']],
    ['VISIT_SCHEDULED', 'BROKER', ['LOSE']],
    ['VISIT_DONE', 'BROKER', ['START_NEGOTIATION', 'WIN', 'LOSE']],
    ['NEGOTIATION', 'BROKER', ['WIN', 'LOSE']],
    ['LOST', 'BROKER', ['REOPEN']],
    ['WON', 'BROKER', []],
    ['WON', 'OWNER', ['UNDO_WIN']],
  ] as const)('%s (%s): %j', (stage, role, expected) => {
    expect(allowedDealActions(stage, role)).toEqual(expected);
  });

  it('venda não pode ser registrada antes da visita', () => {
    for (const stage of ['NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_SCHEDULED'] as const) {
      expect(allowedDealActions(stage, 'OWNER')).not.toContain('WIN');
    }
  });
});

describe('validateWin', () => {
  it('aceita valor válido', () => {
    expect(validateWin({ value: 450000, kind: 'SALE' })).toEqual([]);
    expect(validateWin({ value: 3500.5, kind: 'RENT' })).toEqual([]);
  });
  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])('recusa valor %s', (value) => {
    expect(validateWin({ value, kind: 'SALE' })).toContain('Informe um valor maior que zero.');
  });
  it('recusa mais de dois dígitos de centavos', () => {
    expect(validateWin({ value: 10.123, kind: 'SALE' })).toHaveLength(1);
  });
  it('recusa valor que não cabe no banco', () => {
    expect(validateWin({ value: 1e11, kind: 'SALE' })).toHaveLength(1);
  });
});

describe('validateLoss', () => {
  it('motivo da lista sem observação: ok', () => {
    expect(validateLoss({ reason: 'PRICE' })).toEqual([]);
  });
  it('"Outro" exige observação', () => {
    expect(validateLoss({ reason: 'OTHER', notes: '' })).toContain('Explique o motivo em poucas palavras.');
    expect(validateLoss({ reason: 'OTHER', notes: 'Mudou de cidade' })).toEqual([]);
  });
  it('motivo fora da lista: recusa', () => {
    expect(validateLoss({ reason: 'QUALQUER' as never })).toContain('Escolha o motivo da perda.');
  });
});

describe('defaultDealKind', () => {
  it('quem quis alugar vira locação; o resto, venda', () => {
    expect(defaultDealKind('rent')).toBe('RENT');
    expect(defaultDealKind('buy')).toBe('SALE');
    expect(defaultDealKind(undefined)).toBe('SALE');
  });
});

describe('resolvePeriod (horário de Brasília)', () => {
  const TZ = 'America/Sao_Paulo';
  // 15/10/2026 às 22h em Brasília = 16/10 01h UTC: o "hoje" precisa ser 15/10.
  const now = new Date('2026-10-16T01:00:00Z');

  it('este mês: do dia 1º ao fim de hoje', () => {
    const p = resolvePeriod({ preset: 'this_month' }, now, TZ);
    expect([p.from, p.to]).toEqual(['2026-10-01', '2026-10-15']);
    expect(p.start.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-10-16T03:00:00.000Z');
  });

  it('últimos 7 dias incluem hoje', () => {
    const p = resolvePeriod({ preset: 'last_7_days' }, now, TZ);
    expect([p.from, p.to]).toEqual(['2026-10-09', '2026-10-15']);
  });

  it('mês passado inteiro', () => {
    const p = resolvePeriod({ preset: 'last_month' }, now, TZ);
    expect([p.from, p.to]).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('mês passado em janeiro vira dezembro do ano anterior', () => {
    const p = resolvePeriod({ preset: 'last_month' }, new Date('2027-01-10T15:00:00Z'), TZ);
    expect([p.from, p.to]).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('período escolhido: o último dia entra inteiro', () => {
    const p = resolvePeriod({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' }, now, TZ);
    expect(p.end.toISOString()).toBe('2026-04-01T03:00:00.000Z');
  });

  it.each([
    [{ from: '2026-03-10', to: '2026-03-01' }, 'A data inicial precisa ser antes da final.'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'Informe as duas datas.'],
    [{ from: '2024-01-01', to: '2026-01-01' }, 'Escolha um período de até 1 ano.'],
  ])('recusa %j', (input, message) => {
    expect(() => resolvePeriod({ preset: 'custom', ...input }, now, TZ)).toThrow(message);
  });
});

describe('rate', () => {
  it('calcula a proporção', () => expect(rate(1, 4)).toBe(0.25));
  it('sem base devolve null, não divide por zero', () => expect(rate(0, 0)).toBeNull());
});

describe('shapeIndicators', () => {
  it('período sem nenhum dado: tudo zero, taxa nula', () => {
    const empty = shapeIndicators({ temperature: [], funnel: [], noShow: [], byBroker: [], byOrigin: [], lossReasons: [] });
    expect(empty.funnel).toEqual({ leads: 0, withVisit: 0, visited: 0, won: 0 });
    expect(empty.noShow).toEqual({ done: 0, noShow: 0, rate: null });
    expect(empty.totals.salesValue).toBe('0.00');
  });

  it('a base de conferência é coerente: funil nunca aumenta de uma etapa para a outra', () => {
    const f = EXPECTED.funnel;
    expect(f.leads).toBeGreaterThanOrEqual(f.withVisit);
    expect(f.withVisit).toBeGreaterThanOrEqual(f.visited);
    expect(f.visited).toBeGreaterThanOrEqual(f.won);
  });
});

describe('docs/indicadores.sql', () => {
  it('está atualizado com as consultas do painel (rode npm run docs:indicators)', () => {
    const file = readFileSync(join(__dirname, '..', '..', 'docs', 'indicadores.sql'), 'utf8');
    expect(file).toBe(buildIndicatorsSqlDoc());
  });
});
