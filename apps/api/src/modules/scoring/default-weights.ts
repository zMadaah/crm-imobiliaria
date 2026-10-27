/**
 * Pesos padrão e agrupamento das respostas para a tela do dono.
 * As respostas vêm do fluxo do bot; aqui só ficam os pontos iniciais.
 */
import { FLOW, type BotContext, type StepKey } from '../bot/qualification-flow';

/** Pontos iniciais. Toda opção do fluxo pontuável precisa estar aqui (validado em teste). */
export const DEFAULT_POINTS: Partial<Record<StepKey, Record<string, number>>> = {
  goal: { live_first: 10, live_move: 10, invest: 10, evaluating: 0 },
  search_stage: { starting: 0, comparing: 8, want_visit: 15 },
  interest: { floor_plans: 5, location: 5, payment_terms: 5 },
  payment: {
    own_funds: 25,
    financing_simulated: 20,
    sell_property: 15,
    financing_not_simulated: 10,
    understand_options: 5,
  },
  timeline: { up_to_30d: 25, up_to_3m: 15, up_to_6m: 5, unknown: 0 },
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
  { id: 'goal', title: 'Morar ou investir', questionKey: 'goal' },
  { id: 'search_stage', title: 'Etapa da busca', questionKey: 'search_stage' },
  { id: 'interest', title: 'O que quer conhecer primeiro', questionKey: 'interest' },
  { id: 'payment', title: 'Forma de pagamento', questionKey: 'payment' },
  { id: 'timeline', title: 'Prazo para o próximo passo', questionKey: 'timeline' },
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
