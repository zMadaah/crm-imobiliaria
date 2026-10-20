import { describe, expect, it } from 'vitest';
import { SCHEDULE, type ScheduleConfig } from '../modules/visits/schedule-config';
import { generateFreeSlots } from '../modules/visits/slots';
import {
  isPendingOutcome,
  overlaps,
  stageAfterVisitEvent,
  validateOutcome,
} from '../modules/visits/visit-rules';
import { formatSlotLabel, fromLocalParts, toLocalParts } from '../modules/visits/zoned-time';

const TZ = 'America/Sao_Paulo';
/** Horário de Brasília → Date */
const brt = (iso: string) => new Date(`${iso}-03:00`);
const local = (date: Date) => {
  const p = toLocalParts(date, TZ);
  return `${p.weekday}|${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${p.hour}:${String(p.minute).padStart(2, '0')}`;
};

describe('fuso horário', () => {
  it('9h em Brasília é 12h UTC', () => {
    expect(fromLocalParts({ year: 2026, month: 10, day: 1, hour: 9, minute: 0 }, TZ).toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('rótulo do horário cabe na lista do WhatsApp', () => {
    expect(formatSlotLabel(brt('2026-10-03T12:30'), TZ)).toBe('Sáb, 03/10 às 12h30');
    expect(formatSlotLabel(brt('2026-10-01T14:00'), TZ)).toBe('Qui, 01/10 às 14h');
  });
});

describe('generateFreeSlots', () => {
  // Quinta-feira, 01/10/2026, 9h em Brasília
  const now = brt('2026-10-01T09:00');
  const slots = (busy = [] as { start: Date; end: Date }[], config: ScheduleConfig = SCHEDULE, at = now) =>
    generateFreeSlots({ now: at, busy, config }).map((s) => local(s.start));

  it('respeita a antecedência mínima de 3 horas', () => {
    const first = generateFreeSlots({ now, busy: [], config: SCHEDULE })[0];
    expect(first.start.getTime()).toBeGreaterThanOrEqual(brt('2026-10-01T12:00').getTime());
  });

  it('oferece no máximo 2 por dia e 8 no total', () => {
    const result = slots();
    expect(result).toHaveLength(8);
    const perDay = new Map<string, number>();
    for (const s of result) perDay.set(s.split(' ')[0], (perDay.get(s.split(' ')[0]) ?? 0) + 1);
    expect([...perDay.values()].every((n) => n <= 2)).toBe(true);
  });

  it('espalha: uma de manhã e uma à tarde quando dá', () => {
    // Sexta, 02/10: expediente inteiro livre
    expect(slots().filter((s) => s.includes('02/10'))).toEqual(['5|02/10 9:00', '5|02/10 14:00']);
  });

  it('pula domingo e respeita o sábado até 13h', () => {
    const result = slots();
    expect(result.some((s) => s.startsWith('0|'))).toBe(false);
    const saturday = generateFreeSlots({ now, busy: [], config: SCHEDULE }).filter((s) => toLocalParts(s.start, TZ).weekday === 6);
    expect(saturday.length).toBeGreaterThan(0);
    for (const slot of saturday) expect(toLocalParts(slot.end, TZ).hour).toBeLessThanOrEqual(13);
  });

  it('toda visita termina dentro do expediente', () => {
    for (const slot of generateFreeSlots({ now, busy: [], config: SCHEDULE })) {
      const end = toLocalParts(slot.end, TZ);
      const hours = SCHEDULE.hours[toLocalParts(slot.start, TZ).weekday]!;
      expect(end.hour * 60 + end.minute).toBeLessThanOrEqual(hours.close * 60);
    }
  });

  it('não oferece horário ocupado', () => {
    const busy = [{ start: brt('2026-10-02T09:00'), end: brt('2026-10-02T10:00') }];
    const friday = slots(busy).filter((s) => s.includes('02/10'));
    expect(friday).not.toContain('5|02/10 9:00');
    expect(friday[0]).toBe('5|02/10 10:00');
  });

  it('corretor sem horário livre no período: lista vazia', () => {
    const everything = [{ start: brt('2026-09-01T00:00'), end: brt('2026-12-01T00:00') }];
    expect(slots(everything)).toEqual([]);
  });

  it('fim de expediente: começa pelo próximo dia útil', () => {
    const lateFriday = brt('2026-10-02T17:30');
    expect(slots([], SCHEDULE, lateFriday)[0]).toBe('6|03/10 9:00');
  });
});

describe('overlaps', () => {
  const visit = { start: brt('2026-10-02T14:00'), end: brt('2026-10-02T15:00') };

  it('encostar não é sobrepor (14h às 15h e 15h às 16h)', () => {
    expect(overlaps(visit, { start: brt('2026-10-02T15:00'), end: brt('2026-10-02T16:00') })).toBe(false);
    expect(overlaps(visit, { start: brt('2026-10-02T13:00'), end: brt('2026-10-02T14:00') })).toBe(false);
  });

  it.each([
    ['começa no meio', '14:30', '15:30'],
    ['termina no meio', '13:30', '14:30'],
    ['contém', '13:00', '16:00'],
    ['contida', '14:15', '14:45'],
    ['igual', '14:00', '15:00'],
  ])('%s: sobrepõe', (_label, start, end) => {
    expect(overlaps(visit, { start: brt(`2026-10-02T${start}`), end: brt(`2026-10-02T${end}`) })).toBe(true);
  });
});

describe('isPendingOutcome', () => {
  const endsAt = brt('2026-10-02T15:00');
  it('marcada e já terminada: pendente', () => {
    expect(isPendingOutcome({ status: 'SCHEDULED', endsAt }, brt('2026-10-02T15:00'))).toBe(true);
  });
  it('marcada e ainda não terminou: não pendente', () => {
    expect(isPendingOutcome({ status: 'SCHEDULED', endsAt }, brt('2026-10-02T14:59'))).toBe(false);
  });
  it.each(['DONE', 'NO_SHOW', 'RESCHEDULED'] as const)('%s: não pendente', (status) => {
    expect(isPendingOutcome({ status, endsAt }, brt('2026-10-03T10:00'))).toBe(false);
  });
});

describe('validateOutcome', () => {
  const visit = { status: 'SCHEDULED' as const, scheduledAt: brt('2026-10-02T14:00') };
  const after = brt('2026-10-02T16:00');

  it('realizada exige comentário', () => {
    expect(validateOutcome(visit, { status: 'DONE', feedback: '' }, after)).toContain('Conte em poucas palavras como foi a visita.');
    expect(validateOutcome(visit, { status: 'DONE', feedback: 'Gostou da cozinha' }, after)).toEqual([]);
  });

  it('não compareceu aceita sem comentário', () => {
    expect(validateOutcome(visit, { status: 'NO_SHOW' }, after)).toEqual([]);
  });

  it('realizada ou não compareceu antes de começar: recusa', () => {
    expect(validateOutcome(visit, { status: 'NO_SHOW' }, brt('2026-10-02T13:00'))).toContain('A visita ainda não começou.');
  });

  it('remarcada exige nova data no futuro', () => {
    expect(validateOutcome(visit, { status: 'RESCHEDULED' }, after)).toContain('Informe a nova data e hora.');
    expect(validateOutcome(visit, { status: 'RESCHEDULED', newStartsAt: brt('2026-10-02T10:00') }, after)).toContain(
      'A nova data precisa ser no futuro.',
    );
    expect(validateOutcome(visit, { status: 'RESCHEDULED', newStartsAt: brt('2026-10-05T10:00') }, after)).toEqual([]);
  });

  it('remarcar antes do horário é permitido', () => {
    expect(validateOutcome(visit, { status: 'RESCHEDULED', newStartsAt: brt('2026-10-05T10:00') }, brt('2026-10-01T10:00'))).toEqual([]);
  });

  it('visita já registrada não pode ser registrada de novo', () => {
    expect(validateOutcome({ ...visit, status: 'DONE' }, { status: 'NO_SHOW' }, after)).toContain(
      'Esta visita já teve o resultado registrado.',
    );
  });

  it('comentário longo demais: recusa', () => {
    expect(validateOutcome(visit, { status: 'DONE', feedback: 'a'.repeat(501) }, after)).toHaveLength(1);
  });
});

describe('stageAfterVisitEvent', () => {
  it.each([
    ['CREATED', 'QUALIFIED', 'VISIT_SCHEDULED'],
    ['CREATED', 'IN_SERVICE', 'VISIT_SCHEDULED'],
    ['CREATED', 'VISIT_DONE', 'VISIT_SCHEDULED'],
    ['CREATED', 'NEGOTIATION', null],
    ['DONE', 'VISIT_SCHEDULED', 'VISIT_DONE'],
    ['DONE', 'WON', null],
    ['NO_SHOW', 'VISIT_SCHEDULED', 'IN_SERVICE'],
    ['NO_SHOW', 'NEGOTIATION', null],
    ['RESCHEDULED', 'VISIT_SCHEDULED', null],
  ] as const)('%s com lead em %s leva a %s', (event, current, expected) => {
    expect(stageAfterVisitEvent(event, current)).toBe(expected);
  });
});
