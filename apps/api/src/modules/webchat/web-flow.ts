/**
 * Fluxo da página de atendimento. Função pura, por cima do motor do bot:
 * consentimento → nome → WhatsApp → as perguntas do bot.
 * O que depende do banco (criar lead, horários, reserva, score) fica no serviço.
 */
import {
  handleInput,
  renderStep,
  startConversation,
  type BotInput,
  type BotState,
  type OutgoingMessage,
  type RecordedAnswer,
} from '../bot/bot-engine';
import { checkMobile, checkName } from './contact';

export type WebPhase = 'consent' | 'name' | 'phone' | 'questions' | 'done';
export type WebStatus = 'ACTIVE' | 'COMPLETED' | 'HANDED_OFF' | 'DECLINED';

export type WebState = {
  phase: WebPhase;
  status: WebStatus;
  engine: BotState;
  name: string | null;
  /** Pediu um corretor antes de informar o contato: depois do WhatsApp, encerra */
  handoffAfterContact: boolean;
};

export type WebResult = {
  state: WebState;
  messages: OutgoingMessage[];
  answer: RecordedAnswer | null;
  /** Preenchido quando o cliente acabou de informar nome e WhatsApp válidos */
  contact: { name: string; phone: string } | null;
};

export const WEB_TEXT = {
  askName: 'Para começar, qual é o seu nome?',
  askNameHandoff:
    'Claro! Para um corretor falar com você, preciso do seu nome e do seu WhatsApp. Usaremos só para este atendimento. Qual é o seu nome?',
  askPhone: (name: string) => `Prazer, ${firstName(name)}! Qual é o seu WhatsApp com DDD? É por ele que o corretor vai falar com você.`,
  typeIt: 'Aqui é só digitar no campo abaixo. 🙂',
  declined: 'Sem problemas! Se mudar de ideia, é só voltar a esta página.',
};

/** Mensagens finais do site: o próximo passo é o corretor chamar no WhatsApp. */
export const WEB_END = {
  completedNoVisit: (broker: string | null) =>
    `Obrigado pelas respostas! ${brokerPhrase(broker)} vai te chamar no WhatsApp com mais informações sobre o empreendimento.`,
  handedOff: (broker: string | null) => `Pronto! ${brokerPhrase(broker)} vai te chamar no WhatsApp em breve.`,
  otherSlot: (broker: string | null) => `Sem problemas! ${brokerPhrase(broker)} vai te chamar no WhatsApp para combinar outro horário.`,
  noSlots: (broker: string | null) => `Perfeito! ${brokerPhrase(broker)} vai te chamar no WhatsApp para combinar o melhor dia e horário da visita.`,
  booked: (confirmation: string, broker: string | null) => `${confirmation}\n\n${brokerPhrase(broker)} vai te chamar no WhatsApp para confirmar.`,
};

function brokerPhrase(broker: string | null): string {
  // Neutro: serve para corretor e corretora.
  return broker ? `${firstName(broker)}, da equipe da CB Engenharia,` : 'Um corretor da CB Engenharia';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function startWebFlow(): { state: WebState; messages: OutgoingMessage[] } {
  const start = startConversation();
  return {
    state: { phase: 'consent', status: 'ACTIVE', engine: start.state, name: null, handoffAfterContact: false },
    messages: start.messages,
  };
}

const text = (body: string): OutgoingMessage => ({ type: 'text', body });

export function handleWebInput(state: WebState, input: BotInput): WebResult {
  const base: WebResult = { state, messages: [], answer: null, contact: null };

  switch (state.phase) {
    case 'consent': {
      const result = handleInput(state.engine, input);
      if (result.status === 'DECLINED') {
        return { ...base, state: { ...state, phase: 'done', status: 'DECLINED', engine: result.state }, messages: [text(WEB_TEXT.declined)], answer: result.answer };
      }
      if (result.status === 'HANDED_OFF') {
        return {
          ...base,
          state: { ...state, phase: 'name', engine: result.state, handoffAfterContact: true },
          messages: [text(WEB_TEXT.askNameHandoff)],
          answer: result.answer,
        };
      }
      if (result.answer?.questionKey === 'greeting') {
        // Aceitou: guarda o motor já na primeira pergunta e pede o contato antes.
        return { ...base, state: { ...state, phase: 'name', engine: result.state }, messages: [text(WEB_TEXT.askName)], answer: result.answer };
      }
      return { ...base, state: { ...state, engine: result.state }, messages: result.messages };
    }

    case 'name': {
      if (input.kind !== 'text') return { ...base, messages: [text(WEB_TEXT.typeIt), text(WEB_TEXT.askName)] };
      const checked = checkName(input.text);
      if (!checked.ok) return { ...base, messages: [text(checked.error)] };
      return { ...base, state: { ...state, phase: 'phone', name: checked.value }, messages: [text(WEB_TEXT.askPhone(checked.value))] };
    }

    case 'phone': {
      if (input.kind !== 'text') return { ...base, messages: [text(WEB_TEXT.typeIt)] };
      const checked = checkMobile(input.text);
      if (!checked.ok) return { ...base, messages: [text(checked.error)] };
      const contact = { name: state.name ?? '', phone: checked.value };
      if (state.handoffAfterContact) {
        // A mensagem final, com o nome do corretor, vem do serviço.
        return { ...base, state: { ...state, phase: 'done', status: 'HANDED_OFF' }, contact };
      }
      return {
        ...base,
        state: { ...state, phase: 'questions' },
        contact,
        messages: [renderStep(state.engine.step, state.engine.context)],
      };
    }

    case 'questions': {
      const result = handleInput(state.engine, input);
      const finished = result.status !== 'ACTIVE';
      return {
        ...base,
        state: { ...state, engine: result.state, status: result.status, phase: finished ? 'done' : 'questions' },
        messages: result.messages,
        answer: result.answer,
      };
    }

    case 'done':
      return base;
  }
}

export type ChatInputSpec =
  | { kind: 'options'; options: { id: string; title: string }[] }
  | { kind: 'text'; field: 'name' | 'phone'; placeholder: string }
  | { kind: 'done' };

/** O que mostrar no campo de resposta da página. */
export function inputFor(state: WebState): ChatInputSpec {
  switch (state.phase) {
    case 'name':
      return { kind: 'text', field: 'name', placeholder: 'Seu nome' };
    case 'phone':
      return { kind: 'text', field: 'phone', placeholder: '(61) 99999-8888' };
    case 'done':
      return { kind: 'done' };
    default: {
      const message = renderStep(state.engine.step, state.engine.context);
      const choices = message.type === 'buttons' ? message.buttons : message.type === 'list' ? message.rows : [];
      // No site não há o limite de 24 caracteres do WhatsApp: mostra o texto completo da opção.
      return { kind: 'options', options: choices.map((c) => ({ id: c.id, title: c.description ?? c.title })) };
    }
  }
}
