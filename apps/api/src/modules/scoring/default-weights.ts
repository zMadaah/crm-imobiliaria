/**
 * Pesos padrão e agrupamento das respostas para a tela do dono.
 * As respostas vêm do fluxo do bot; aqui só ficam os pontos iniciais.
 */
import { FLOW, type BotContext, type StepKey } from '../bot/qualification-flow';

/** Pontos iniciais. Toda opção do fluxo pontuável precisa estar aqui (validado em teste). */
export const DEFAULT_POINTS: Partial<Record<StepKey, Record<string, number>>> = {
  intent: { buy: 0, rent: 0 },
  region: { centro: 10, zona_norte: 10, zona_sul: 10, zona_leste: 10, zona_oeste: 10, outra: 0 },
  price: {
    up_to_300k: 10,
    '300k_500k': 10,
    '500k_1m': 10,
    '1m_2m': 10,
    over_2m: 10,
    up_to_1500: 10,
    '1500_3000': 10,
    '3000_5000': 10,
    over_5000: 10,
  },
  payment: {
    cash: 25,
    financing_approved: 25,
    will_finance: 10,
    unknown: 0,
    guarantor: 20,
    deposit: 20,
    insurance: 20,
    guarantee_unknown: 0,
  },
  timeline: { up_to_3m: 25, '3m_6m': 15, over_6m: 5, researching: 0 },
  decision_maker: { alone: 5, shared: 3 },
  visit: { yes: 20, no: 0 },
};

export type WeightGroup = {
  id: string;
  title: string;
  questionKey: StepKey;
  answers: { answerKey: string; label: string; defaultPoints: number }[];
};

type GroupDefinition = { id: string; title: string; questionKey: StepKey; context?: BotContext['answers'] };

const GROUPS: GroupDefinition[] = [
  { id: 'intent', title: 'Comprar ou alugar', questionKey: 'intent' },
  { id: 'region', title: 'Região', questionKey: 'region' },
  { id: 'price_buy', title: 'Faixa de preço na compra', questionKey: 'price', context: { intent: 'buy' } },
  { id: 'price_rent', title: 'Faixa de aluguel', questionKey: 'price', context: { intent: 'rent' } },
  { id: 'payment_buy', title: 'Forma de pagamento', questionKey: 'payment', context: { intent: 'buy' } },
  { id: 'payment_rent', title: 'Garantia do aluguel', questionKey: 'payment', context: { intent: 'rent' } },
  { id: 'timeline', title: 'Prazo', questionKey: 'timeline' },
  { id: 'decision_maker', title: 'Quem decide', questionKey: 'decision_maker' },
  { id: 'visit', title: 'Pedido de visita', questionKey: 'visit' },
];

export function buildWeightGroups(): WeightGroup[] {
  return GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    questionKey: group.questionKey,
    answers: FLOW[group.questionKey].options({ answers: group.context ?? {} }).map((option) => ({
      answerKey: option.id,
      label: option.label,
      defaultPoints: DEFAULT_POINTS[group.questionKey]?.[option.id] ?? 0,
    })),
  }));
}

/** Todas as combinações pergunta + resposta que têm peso. */
export function allWeightKeys(): { questionKey: StepKey; answerKey: string; defaultPoints: number }[] {
  const seen = new Set<string>();
  const keys: { questionKey: StepKey; answerKey: string; defaultPoints: number }[] = [];
  for (const group of buildWeightGroups()) {
    for (const answer of group.answers) {
      const id = `${group.questionKey}:${answer.answerKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      keys.push({ questionKey: group.questionKey, answerKey: answer.answerKey, defaultPoints: answer.defaultPoints });
    }
  }
  return keys;
}
