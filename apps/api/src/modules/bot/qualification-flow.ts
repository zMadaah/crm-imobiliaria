/**
 * Configuração do fluxo de qualificação.
 * Textos, opções e ramificações ficam aqui para serem editados sem mexer no motor.
 *
 * Limites do WhatsApp (validados em teste):
 * - botões: no máximo 3, título até 20 caracteres
 * - lista: no máximo 10 linhas, título da linha até 24 caracteres, descrição até 72
 * - corpo da mensagem: até 1024 caracteres
 */

export const COMPANY_NAME = 'CB Engenharia';

export const STEP_KEYS = [
  'greeting',
  'goal',
  'search_stage',
  'interest',
  'payment',
  'timeline',
  'visit',
  'visit_slot',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export type BotContext = {
  answers: Partial<Record<StepKey, string>>;
  /** Horários livres oferecidos no passo visit_slot (preenchidos pelo serviço, não pelo motor) */
  slots?: FlowOption[];
};

/** description: linha menor embaixo do título na lista do WhatsApp (até 72 caracteres) */
export type FlowOption = { id: string; label: string; description?: string };

export type FlowEnd = {
  end: 'COMPLETED' | 'HANDED_OFF' | 'DECLINED';
  message: string;
};

export type StepDefinition = {
  question: (ctx: BotContext) => string;
  options: (ctx: BotContext) => FlowOption[];
  /** Próximo passo após uma resposta válida ou "no_answer" */
  next: (answerId: string, ctx: BotContext) => StepKey | FlowEnd;
  /** Destino quando a pessoa erra duas vezes; padrão é seguir com next("no_answer") */
  onNoAnswer?: FlowEnd;
};

export const HANDOFF_OPTION_ID = 'handoff';
export const HANDOFF_LABEL = 'Falar com corretor';
export const NO_ANSWER_ID = 'no_answer';
export const NO_ANSWER_LABEL = 'Sem resposta';
export const LIST_BUTTON_TEXT = 'Ver opções';
export const LIST_SECTION_TITLE = 'Opções';

export const INVALID_PREFIX = 'Não entendi 😅 Escolha uma das opções abaixo, por favor.';

/** Texto digitado que encaminha para um corretor em qualquer passo. */
export const HANDOFF_TEXT_PATTERN = /\b(corretor|corretora|atendente|humano)\b/i;

export const END_MESSAGES = {
  handoff: 'Certo! Já chamei um corretor para continuar o seu atendimento. Ele responde por aqui mesmo. 😊',
  declined: 'Sem problemas! Se mudar de ideia, é só mandar uma mensagem por aqui.',
  visitYes:
    'Perfeito! Um corretor vai falar com você em breve para combinar o melhor dia e horário da visita. 🏡',
  visitNo:
    'Tudo bem! Um corretor vai te enviar mais informações sobre o empreendimento. Se quiser visitar depois, é só chamar aqui.',
  visitOther: 'Sem problemas! O corretor vai falar com você para combinar outro horário. 😊',
};

export const SLOT_TAKEN_PREFIX = 'Esse horário acabou de ser reservado. Escolha outro, por favor:';
export const OTHER_SLOT_ID = 'other';

export const FLOW: Record<StepKey, StepDefinition> = {
  greeting: {
    question: () =>
      `Olá! 👋 Aqui é o assistente virtual da ${COMPANY_NAME}.\n\n` +
      'Vou fazer algumas perguntas rápidas para entender o que você procura. ' +
      'Suas respostas serão usadas apenas para este atendimento, conforme a LGPD.\n\n' +
      'Podemos começar?',
    options: () => [
      { id: 'accept', label: 'Sim, vamos lá' },
      { id: 'decline', label: 'Agora não' },
    ],
    next: (answer) => (answer === 'decline' ? { end: 'DECLINED', message: END_MESSAGES.declined } : 'goal'),
    // Sem consentimento não seguimos com perguntas: quem digita livremente vai para um humano.
    onNoAnswer: { end: 'HANDED_OFF', message: END_MESSAGES.handoff },
  },

  goal: {
    question: () => 'Você está buscando um apartamento para morar ou para investir?',
    options: () => [
      { id: 'live_first', label: 'Morar (primeiro imóvel)' },
      { id: 'live_move', label: 'Morar (mudança)' },
      { id: 'invest', label: 'Investir' },
      { id: 'evaluating', label: 'Ainda estou avaliando' },
    ],
    next: () => 'search_stage',
  },

  search_stage: {
    question: () => 'Em que etapa da busca você está?',
    options: () => [
      { id: 'starting', label: 'Comecei a pesquisar', description: 'Comecei a pesquisar agora' },
      { id: 'comparing', label: 'Comparando opções', description: 'Já estou comparando opções' },
      { id: 'want_visit', label: 'Já quero visitar' },
    ],
    next: () => 'interest',
  },

  interest: {
    question: () => 'O que você gostaria de conhecer primeiro sobre o empreendimento?',
    options: () => [
      { id: 'floor_plans', label: 'Plantas' },
      { id: 'location', label: 'Localização e estrutura' },
      { id: 'payment_terms', label: 'Condições de pagamento' },
    ],
    next: () => 'payment',
  },

  payment: {
    question: () => 'Como você pretende pagar?',
    options: () => [
      { id: 'own_funds', label: 'Recursos próprios' },
      { id: 'financing_simulated', label: 'Financiar (já simulei)', description: 'Entrada + financiamento, já fiz simulação' },
      { id: 'financing_not_simulated', label: 'Financiar (não simulei)', description: 'Entrada + financiamento, ainda não simulei' },
      { id: 'sell_property', label: 'Venda de outro imóvel' },
      { id: 'understand_options', label: 'Quero entender opções', description: 'Quero entender as opções' },
    ],
    next: () => 'timeline',
  },

  timeline: {
    question: () => 'Em quanto tempo pretende dar o próximo passo na compra?',
    options: () => [
      { id: 'up_to_30d', label: 'Até 30 dias' },
      { id: 'up_to_3m', label: 'Até 3 meses' },
      { id: 'up_to_6m', label: 'Até 6 meses' },
      { id: 'unknown', label: 'Ainda não sei' },
    ],
    next: () => 'visit',
  },

  visit: {
    question: () => 'Obrigado pelas respostas! 🙌 Vamos agendar uma visita?',
    options: () => [
      { id: 'yes', label: 'Sim' },
      { id: 'no', label: 'Não' },
    ],
    next: (answer) => (answer === 'yes' ? 'visit_slot' : { end: 'COMPLETED', message: END_MESSAGES.visitNo }),
  },

  // Os horários vêm do contexto: o serviço calcula os livres do corretor antes de mostrar.
  visit_slot: {
    question: () => 'Ótimo! Escolha o melhor horário para a visita:',
    options: (ctx) => [...(ctx.slots ?? []), { id: OTHER_SLOT_ID, label: 'Outro horário' }],
    next: (answer) => ({
      end: 'COMPLETED',
      // Com horário escolhido, o serviço troca esta mensagem pela confirmação com data e corretor.
      message: answer === OTHER_SLOT_ID || answer === 'no_answer' ? END_MESSAGES.visitOther : END_MESSAGES.visitYes,
    }),
  },
};

export function isStepKey(value: string): value is StepKey {
  return (STEP_KEYS as readonly string[]).includes(value);
}

/** Títulos curtos das perguntas, usados no painel. */
export const QUESTION_TITLES: Record<StepKey, string> = {
  greeting: 'Consentimento de uso dos dados',
  goal: 'Morar ou investir',
  search_stage: 'Etapa da busca',
  interest: 'Quer conhecer primeiro',
  payment: 'Forma de pagamento',
  timeline: 'Prazo para o próximo passo',
  visit: 'Pedido de visita',
  visit_slot: 'Horário da visita',
};

/** Perguntas do fluxo anterior: só para exibir respostas de leads antigos. */
const LEGACY_QUESTION_TITLES: Record<string, string> = {
  intent: 'Comprar ou alugar',
  region: 'Região',
  price: 'Faixa de preço',
  decision_maker: 'Quem decide',
};

export function questionTitle(key: string): string {
  return isStepKey(key) ? QUESTION_TITLES[key] : (LEGACY_QUESTION_TITLES[key] ?? key);
}
