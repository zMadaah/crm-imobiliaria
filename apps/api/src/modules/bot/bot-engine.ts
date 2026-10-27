/**
 * Máquina de estados do chatbot. Função pura: não acessa banco nem rede,
 * só recebe o estado atual + a entrada e devolve o novo estado, a resposta
 * a gravar e as mensagens a enviar.
 */
import {
  FLOW,
  HANDOFF_LABEL,
  HANDOFF_OPTION_ID,
  HANDOFF_TEXT_PATTERN,
  END_MESSAGES,
  INVALID_PREFIX,
  LIST_BUTTON_TEXT,
  NO_ANSWER_ID,
  NO_ANSWER_LABEL,
  type BotContext,
  type FlowEnd,
  type FlowOption,
  type StepKey,
} from './qualification-flow';

export type BotStatus = 'ACTIVE' | 'COMPLETED' | 'HANDED_OFF' | 'DECLINED';

export type BotState = {
  step: StepKey;
  retryCount: number;
  context: BotContext;
};

export type BotInput =
  | { kind: 'reply'; id: string }
  | { kind: 'text'; text: string }
  | { kind: 'other' };

export type InteractiveChoice = { id: string; title: string; description?: string };

export type OutgoingMessage =
  | { type: 'text'; body: string }
  | { type: 'buttons'; body: string; buttons: InteractiveChoice[] }
  | { type: 'list'; body: string; buttonText: string; rows: InteractiveChoice[] };

export type RecordedAnswer = {
  questionKey: StepKey;
  answerKey: string;
  answerLabel: string;
};

export type BotResult = {
  state: BotState;
  status: BotStatus;
  answer: RecordedAnswer | null;
  messages: OutgoingMessage[];
};

const FIRST_STEP: StepKey = 'greeting';

export function replyId(step: StepKey, optionId: string): string {
  return `${step}:${optionId}`;
}

/** Monta a pergunta de um passo: até 2 opções vira botões, mais que isso vira lista. */
export function renderStep(step: StepKey, context: BotContext, prefix?: string): OutgoingMessage {
  const definition = FLOW[step];
  const question = definition.question(context);
  const body = prefix ? `${prefix}\n\n${question}` : question;

  const choices: InteractiveChoice[] = [
    ...definition.options(context).map((option) => ({
      id: replyId(step, option.id),
      title: option.label,
      ...(option.description ? { description: option.description } : {}),
    })),
    { id: replyId(step, HANDOFF_OPTION_ID), title: HANDOFF_LABEL },
  ];

  if (choices.length <= 3) return { type: 'buttons', body, buttons: choices };
  return { type: 'list', body, buttonText: LIST_BUTTON_TEXT, rows: choices };
}

export function startConversation(): BotResult {
  const state: BotState = { step: FIRST_STEP, retryCount: 0, context: { answers: {} } };
  return { state, status: 'ACTIVE', answer: null, messages: [renderStep(FIRST_STEP, state.context)] };
}

export function handleInput(state: BotState, input: BotInput): BotResult {
  if (wantsBroker(input)) {
    return { state, status: 'HANDED_OFF', answer: null, messages: [{ type: 'text', body: END_MESSAGES.handoff }] };
  }

  const definition = FLOW[state.step];
  const options = definition.options(state.context);
  const selected = resolveSelection(state.step, options, input);

  if (selected) {
    const context = withAnswer(state.context, state.step, selected.id);
    return advance(state, context, definition.next(selected.id, context), {
      questionKey: state.step,
      answerKey: selected.id,
      answerLabel: selected.label,
    });
  }

  // Primeira resposta inválida: repete a pergunta uma vez.
  if (state.retryCount === 0) {
    return {
      state: { ...state, retryCount: 1 },
      status: 'ACTIVE',
      answer: null,
      messages: [renderStep(state.step, state.context, INVALID_PREFIX)],
    };
  }

  // Segunda inválida: grava "sem resposta" e segue.
  const context = withAnswer(state.context, state.step, NO_ANSWER_ID);
  const target = definition.onNoAnswer ?? definition.next(NO_ANSWER_ID, context);
  return advance(state, context, target, {
    questionKey: state.step,
    answerKey: NO_ANSWER_ID,
    answerLabel: NO_ANSWER_LABEL,
  });
}

function advance(
  state: BotState,
  context: BotContext,
  target: StepKey | FlowEnd,
  answer: RecordedAnswer,
): BotResult {
  if (typeof target === 'object') {
    return {
      state: { ...state, retryCount: 0, context },
      status: target.end,
      answer,
      messages: [{ type: 'text', body: target.message }],
    };
  }
  return {
    state: { step: target, retryCount: 0, context },
    status: 'ACTIVE',
    answer,
    messages: [renderStep(target, context)],
  };
}

function wantsBroker(input: BotInput): boolean {
  if (input.kind === 'reply') return input.id.endsWith(`:${HANDOFF_OPTION_ID}`);
  if (input.kind === 'text') return HANDOFF_TEXT_PATTERN.test(input.text);
  return false;
}

function resolveSelection(step: StepKey, options: FlowOption[], input: BotInput): FlowOption | null {
  if (input.kind === 'reply') {
    const separator = input.id.indexOf(':');
    if (separator < 0) return null;
    // Toque num botão de uma pergunta anterior não vale como resposta da atual.
    if (input.id.slice(0, separator) !== step) return null;
    const optionId = input.id.slice(separator + 1);
    return options.find((option) => option.id === optionId) ?? null;
  }

  if (input.kind === 'text') {
    // Aceita a opção digitada por extenso: "comprar", "só eu"...
    const typed = normalize(input.text);
    return options.find((option) => normalize(option.label) === typed) ?? null;
  }

  return null;
}

function withAnswer(context: BotContext, step: StepKey, answerId: string): BotContext {
  return { ...context, answers: { ...context.answers, [step]: answerId } };
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
