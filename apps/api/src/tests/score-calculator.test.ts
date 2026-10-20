import { describe, expect, it } from 'vitest';
import { STEP_KEYS } from '../modules/bot/qualification-flow';
import { allWeightKeys, buildWeightGroups, DEFAULT_POINTS } from '../modules/scoring/default-weights';
import {
  calculateScore,
  temperatureFor,
  validateWeightUpdates,
  weightKey,
  type AnswerInput,
} from '../modules/scoring/score-calculator';

const defaultWeights = () =>
  new Map(allWeightKeys().map((k) => [weightKey(k.questionKey, k.answerKey), k.defaultPoints]));

const answers = (pairs: Record<string, string>): AnswerInput[] =>
  Object.entries(pairs).map(([questionKey, answerKey]) => ({ questionKey, answerKey }));

const STRONG_BUYER = {
  greeting: 'accept',
  goal: 'live_first',
  search_stage: 'want_visit',
  interest: 'payment_terms',
  payment: 'own_funds',
  timeline: 'up_to_30d',
};

describe('temperatureFor (bordas das faixas)', () => {
  it.each([
    [0, 'COLD'],
    [39, 'COLD'],
    [40, 'WARM'],
    [69, 'WARM'],
    [70, 'HOT'],
    [100, 'HOT'],
  ])('%i pontos = %s', (score, expected) => {
    expect(temperatureFor(score)).toBe(expected);
  });
});

describe('calculateScore com os pesos padrão', () => {
  it('perfil mais forte com visita: 100, quente', () => {
    const result = calculateScore(answers({ ...STRONG_BUYER, visit: 'yes' }), defaultWeights());
    expect(result.score).toBe(100);
    expect(result.temperature).toBe('HOT');
  });

  it('mesmo perfil sem visita ainda é quente (80)', () => {
    expect(calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), defaultWeights()).score).toBe(80);
  });

  it('pedido de visita soma exatamente 20', () => {
    const withVisit = calculateScore(answers({ ...STRONG_BUYER, visit: 'yes' }), defaultWeights()).score;
    const without = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), defaultWeights()).score;
    expect(withVisit - without).toBe(20);
  });

  it('investidor comparando, financiamento sem simular em 3 meses: morno', () => {
    const result = calculateScore(
      answers({ goal: 'invest', search_stage: 'comparing', interest: 'location', payment: 'financing_not_simulated', timeline: 'up_to_3m', visit: 'no' }),
      defaultWeights(),
    );
    expect(result.score).toBe(48);
    expect(result.temperature).toBe('WARM');
  });

  it('quem está avaliando, só pesquisando e sem prazo é frio', () => {
    const result = calculateScore(
      answers({ goal: 'evaluating', search_stage: 'starting', interest: 'floor_plans', payment: 'understand_options', timeline: 'unknown', visit: 'no' }),
      defaultWeights(),
    );
    expect(result.score).toBe(10);
    expect(result.temperature).toBe('COLD');
  });

  it('"Sem resposta" vale 0', () => {
    expect(calculateScore(answers({ timeline: 'no_answer', payment: 'no_answer' }), defaultWeights()).score).toBe(0);
  });

  it('respostas do fluxo antigo não pontuam mais', () => {
    expect(calculateScore(answers({ intent: 'buy', region: 'centro', price: '500k_1m' }), defaultWeights()).score).toBe(0);
  });

  it('encaminhado no meio: conta só o que foi respondido', () => {
    const result = calculateScore(answers({ greeting: 'accept', goal: 'invest', search_stage: 'comparing' }), defaultWeights());
    expect(result.score).toBe(18);
  });
});

describe('calculateScore com pesos editados pelo dono', () => {
  it('mudar um peso altera o resultado', () => {
    const weights = defaultWeights();
    const before = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), weights).score;
    weights.set(weightKey('timeline', 'up_to_30d'), 40);
    const after = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), weights).score;
    expect(after - before).toBe(15);
  });

  it('a soma é limitada a 100', () => {
    const weights = defaultWeights();
    weights.set(weightKey('timeline', 'up_to_30d'), 100);
    weights.set(weightKey('payment', 'own_funds'), 100);
    const result = calculateScore(answers(STRONG_BUYER), weights);
    expect(result.score).toBe(100);
    expect(result.temperature).toBe('HOT');
  });
});

describe('pesos padrão', () => {
  it('toda opção pontuável do fluxo tem peso padrão explícito', () => {
    for (const group of buildWeightGroups()) {
      for (const answer of group.answers) {
        expect(DEFAULT_POINTS[group.questionKey], group.id).toBeDefined();
        expect(DEFAULT_POINTS[group.questionKey]![answer.answerKey], `${group.id}:${answer.answerKey}`).toBeTypeOf('number');
      }
    }
  });

  it('todas as perguntas, exceto a saudação e o horário da visita, têm grupo de pesos', () => {
    const covered = new Set(buildWeightGroups().map((g) => g.questionKey));
    expect([...covered].sort()).toEqual(STEP_KEYS.filter((k) => k !== 'greeting' && k !== 'visit_slot').sort());
  });

  it('não há chave duplicada nem peso fora de 0 a 100', () => {
    const keys = allWeightKeys();
    expect(new Set(keys.map((k) => weightKey(k.questionKey, k.answerKey))).size).toBe(keys.length);
    for (const k of keys) {
      expect(k.defaultPoints).toBeGreaterThanOrEqual(0);
      expect(k.defaultPoints).toBeLessThanOrEqual(100);
    }
  });

  it('o perfil mais forte possível cabe em 100', () => {
    const maxPerQuestion = new Map<string, number>();
    for (const k of allWeightKeys()) {
      maxPerQuestion.set(k.questionKey, Math.max(maxPerQuestion.get(k.questionKey) ?? 0, k.defaultPoints));
    }
    const max = [...maxPerQuestion.values()].reduce((a, b) => a + b, 0);
    expect(max).toBe(100);
  });
});

describe('validateWeightUpdates', () => {
  const allowed = new Set(allWeightKeys().map((k) => weightKey(k.questionKey, k.answerKey)));

  it('aceita alteração válida', () => {
    expect(validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'up_to_30d', points: 50 }], allowed)).toEqual([]);
  });

  it.each([-1, 101, 1.5, Number.NaN])('recusa %s pontos', (points) => {
    expect(validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'up_to_30d', points }], allowed)).toHaveLength(1);
  });

  it('recusa resposta que não existe no fluxo', () => {
    const errors = validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'amanha', points: 10 }], allowed);
    expect(errors[0]).toContain('desconhecida');
  });
});
