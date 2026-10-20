/**
 * Configuração do fluxo de qualificação.
 * Textos, opções e ramificações ficam aqui para serem editados sem mexer no motor.
 *
 * Limites do WhatsApp (validados em teste):
 * - botões: no máximo 3, título até 20 caracteres
 * - lista: no máximo 10 linhas, título da linha até 24 caracteres
 * - corpo da mensagem: até 1024 caracteres
 */

// TODO: trocar pelos dados reais da imobiliária
export const COMPANY_NAME = 'Imobiliária Exemplo';

export const STEP_KEYS = [
  'greeting',
  'intent',
  'region',
  'price',
  'payment',
  'timeline',
  'decision_maker',
  'visit',
  'visit_slot',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export type BotContext = {
  answers: Partial<Record<StepKey, string>>;
  /** Horários livres oferecidos no passo visit_slot (preenchidos pelo serviço, não pelo motor) */
  slots?: FlowOption[];
};

export type FlowOption = { id: string; label: string };

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
    'Tudo bem! Um corretor vai te enviar algumas opções que combinam com o que você procura. Se quiser visitar depois, é só chamar aqui.',
  visitOther: 'Sem problemas! O corretor vai falar com você para combinar outro horário. 😊',
};

export const SLOT_TAKEN_PREFIX = 'Esse horário acabou de ser reservado. Escolha outro, por favor:';
export const OTHER_SLOT_ID = 'other';

const isRent = (ctx: BotContext) => ctx.answers.intent === 'rent';

// TODO: trocar pelas regiões reais (no máximo 9, porque a 10ª linha é "Falar com corretor")
const REGIONS: FlowOption[] = [
  { id: 'centro', label: 'Centro' },
  { id: 'zona_norte', label: 'Zona Norte' },
  { id: 'zona_sul', label: 'Zona Sul' },
  { id: 'zona_leste', label: 'Zona Leste' },
  { id: 'zona_oeste', label: 'Zona Oeste' },
  { id: 'outra', label: 'Outra região' },
];

// TODO: ajustar faixas à realidade da imobiliária
const BUY_PRICES: FlowOption[] = [
  { id: 'up_to_300k', label: 'Até R$ 300 mil' },
  { id: '300k_500k', label: 'R$ 300 a 500 mil' },
  { id: '500k_1m', label: 'R$ 500 mil a 1 milhão' },
  { id: '1m_2m', label: 'R$ 1 a 2 milhões' },
  { id: 'over_2m', label: 'Acima de R$ 2 milhões' },
];

const RENT_PRICES: FlowOption[] = [
  { id: 'up_to_1500', label: 'Até R$ 1.500' },
  { id: '1500_3000', label: 'R$ 1.500 a 3.000' },
  { id: '3000_5000', label: 'R$ 3.000 a 5.000' },
  { id: 'over_5000', label: 'Acima de R$ 5.000' },
];

const BUY_PAYMENT: FlowOption[] = [
  { id: 'cash', label: 'À vista' },
  { id: 'financing_approved', label: 'Financiamento aprovado' },
  { id: 'will_finance', label: 'Vou financiar' },
  { id: 'unknown', label: 'Ainda não sei' },
];

const RENT_GUARANTEE: FlowOption[] = [
  { id: 'guarantor', label: 'Fiador' },
  { id: 'deposit', label: 'Caução' },
  { id: 'insurance', label: 'Seguro fiança' },
  { id: 'guarantee_unknown', label: 'Ainda não sei' },
];

export const FLOW: Record<StepKey, StepDefinition> = {
  greeting: {
    question: () =>
      `Olá! 👋 Aqui é o assistente virtual da ${COMPANY_NAME}.\n\n` +
      'Vou fazer algumas perguntas rápidas para encontrar o imóvel ideal para você. ' +
      'Suas respostas serão usadas apenas para este atendimento, conforme a LGPD.\n\n' +
      'Podemos começar?',
    options: () => [
      { id: 'accept', label: 'Sim, vamos lá' },
      { id: 'decline', label: 'Agora não' },
    ],
    next: (answer) => (answer === 'decline' ? { end: 'DECLINED', message: END_MESSAGES.declined } : 'intent'),
    // Sem consentimento não seguimos com perguntas: quem digita livremente vai para um humano.
    onNoAnswer: { end: 'HANDED_OFF', message: END_MESSAGES.handoff },
  },

  intent: {
    question: () => 'Você procura um imóvel para comprar ou para alugar?',
    options: () => [
      { id: 'buy', label: 'Comprar' },
      { id: 'rent', label: 'Alugar' },
    ],
    next: () => 'region',
  },

  region: {
    question: () => 'Em qual região você procura?',
    options: () => REGIONS,
    next: () => 'price',
  },

  price: {
    question: (ctx) =>
      isRent(ctx)
        ? 'Qual faixa de aluguel mensal cabe no seu orçamento?'
        : 'Qual faixa de valor você pretende investir?',
    options: (ctx) => (isRent(ctx) ? RENT_PRICES : BUY_PRICES),
    next: () => 'payment',
  },

  payment: {
    question: (ctx) =>
      isRent(ctx) ? 'Qual garantia você pretende usar no aluguel?' : 'Como você pretende pagar?',
    options: (ctx) => (isRent(ctx) ? RENT_GUARANTEE : BUY_PAYMENT),
    next: () => 'timeline',
  },

  timeline: {
    question: () => 'Para quando você precisa do imóvel?',
    options: () => [
      { id: 'up_to_3m', label: 'Até 3 meses' },
      { id: '3m_6m', label: '3 a 6 meses' },
      { id: 'over_6m', label: 'Mais de 6 meses' },
      { id: 'researching', label: 'Só pesquisando' },
    ],
    next: () => 'decision_maker',
  },

  decision_maker: {
    question: () => 'A decisão será só sua ou junto com outra pessoa?',
    options: () => [
      { id: 'alone', label: 'Só eu' },
      { id: 'shared', label: 'Com outra pessoa' },
    ],
    next: () => 'visit',
  },

  visit: {
    question: () => 'Obrigado pelas respostas! 🙌 Quer agendar uma visita com um dos nossos corretores?',
    options: () => [
      { id: 'yes', label: 'Sim, quero visitar' },
      { id: 'no', label: 'Agora não' },
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
  intent: 'Comprar ou alugar',
  region: 'Região',
  price: 'Faixa de preço',
  payment: 'Pagamento ou garantia',
  timeline: 'Prazo',
  decision_maker: 'Quem decide',
  visit: 'Pedido de visita',
  visit_slot: 'Horário da visita',
};
