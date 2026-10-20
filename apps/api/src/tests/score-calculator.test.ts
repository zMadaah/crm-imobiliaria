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
  intent: 'buy',
  region: 'centro',
  price: '500k_1m',
  payment: 'cash',
  timeline: 'up_to_3m',
  decision_maker: 'alone',
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
  it('comprador forte que pede visita: 95, quente', () => {
    const result = calculateScore(answers({ ...STRONG_BUYER, visit: 'yes' }), defaultWeights());
    expect(result.score).toBe(95);
    expect(result.temperature).toBe('HOT');
  });

  it('comprador forte sem visita ainda é quente (75)', () => {
    const result = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), defaultWeights());
    expect(result.score).toBe(75);
    expect(result.temperature).toBe('HOT');
  });

  it('pedido de visita soma exatamente 20', () => {
    const withVisit = calculateScore(answers({ ...STRONG_BUYER, visit: 'yes' }), defaultWeights());
    const without = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), defaultWeights());
    expect(withVisit.score - without.score).toBe(20);
  });

  it('quem vai financiar em 3 a 6 meses é morno', () => {
    const result = calculateScore(
      answers({ ...STRONG_BUYER, payment: 'will_finance', timeline: '3m_6m', visit: 'no' }),
      defaultWeights(),
    );
    expect(result.score).toBe(50);
    expect(result.temperature).toBe('WARM');
  });

  it('quem só está pesquisando e não sabe pagar é frio', () => {
    const result = calculateScore(
      answers({ ...STRONG_BUYER, payment: 'unknown', timeline: 'researching', decision_maker: 'shared', visit: 'no' }),
      defaultWeights(),
    );
    expect(result.score).toBe(23);
    expect(result.temperature).toBe('COLD');
  });

  it('ramo de aluguel usa os pesos da garantia', () => {
    const result = calculateScore(
      answers({ intent: 'rent', region: 'zona_sul', price: '1500_3000', payment: 'insurance', timeline: 'up_to_3m', decision_maker: 'alone', visit: 'yes' }),
      defaultWeights(),
    );
    expect(result.score).toBe(90);
  });

  it('"Sem resposta" vale 0', () => {
    const result = calculateScore(answers({ timeline: 'no_answer', payment: 'no_answer' }), defaultWeights());
    expect(result.score).toBe(0);
    expect(result.breakdown.every((item) => item.points === 0)).toBe(true);
  });

  it('consentimento e respostas sem peso cadastrado valem 0', () => {
    const result = calculateScore(answers({ greeting: 'accept', region: 'regiao_nova' }), defaultWeights());
    expect(result.score).toBe(0);
  });

  it('encaminhado no meio: conta só o que foi respondido', () => {
    const result = calculateScore(answers({ greeting: 'accept', intent: 'buy', region: 'centro' }), defaultWeights());
    expect(result.score).toBe(10);
    expect(result.breakdown).toHaveLength(3);
  });

  it('breakdown devolve os pontos de cada resposta, na ordem', () => {
    const result = calculateScore(answers({ timeline: 'up_to_3m', payment: 'cash' }), defaultWeights());
    expect(result.breakdown.map((b) => b.points)).toEqual([25, 25]);
  });
});

describe('calculateScore com pesos editados pelo dono', () => {
  it('mudar um peso altera o resultado', () => {
    const weights = defaultWeights();
    const before = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), weights).score;
    weights.set(weightKey('timeline', 'up_to_3m'), 50);
    const after = calculateScore(answers({ ...STRONG_BUYER, visit: 'no' }), weights).score;
    expect(after - before).toBe(25);
  });

  it('a soma é limitada a 100', () => {
    const weights = defaultWeights();
    weights.set(weightKey('timeline', 'up_to_3m'), 100);
    weights.set(weightKey('payment', 'cash'), 100);
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
    expect(max).toBe(95);
  });
});

describe('validateWeightUpdates', () => {
  const allowed = new Set(allWeightKeys().map((k) => weightKey(k.questionKey, k.answerKey)));

  it('aceita alteração válida', () => {
    expect(validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'up_to_3m', points: 50 }], allowed)).toEqual([]);
  });

  it.each([-1, 101, 1.5, Number.NaN])('recusa %s pontos', (points) => {
    expect(validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'up_to_3m', points }], allowed)).toHaveLength(1);
  });

  it('recusa resposta que não existe no fluxo', () => {
    const errors = validateWeightUpdates([{ questionKey: 'timeline', answerKey: 'amanha', points: 10 }], allowed);
    expect(errors[0]).toContain('desconhecida');
  });
});
