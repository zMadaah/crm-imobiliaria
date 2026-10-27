/**
 * Atendimento pela página do site: guarda a conversa, cria o lead quando o cliente
 * informa o WhatsApp e reaproveita do bot a reserva de horários e o score.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { LeadStage, Prisma, Visit } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { type BotInput, type BotResult, type OutgoingMessage, type RecordedAnswer } from '../bot/bot-engine';
import { bookSlot, offerSlots } from '../bot/booking';
import { withLeadLock } from '../bot/lead-lock';
import { COMPANY_NAME, NO_ANSWER_ID, OTHER_SLOT_ID, SLOT_TAKEN_PREFIX } from '../bot/qualification-flow';
import { assignNextBroker } from '../leads/assignment.service';
import { findOrCreateLeadByPhone } from '../leads/lead.service';
import { changeLeadStage } from '../leads/lead-stage.service';
import { notifyHotLead, notifyLeadReturned } from '../notifications/notification.service';
import { scoreLead } from '../scoring/scoring.service';
import { publishLeadMessage, toMessageDto } from '../realtime/lead-events';
import { SCHEDULE } from '../visits/schedule-config';
import { notifyVisitBooked } from '../visits/visit.service';
import { formatSlotLabel } from '../visits/zoned-time';
import { stageAfterVisitEvent } from '../visits/visit-rules';
import { normalizeAdCode } from './contact';
import { handleWebInput, inputFor, startWebFlow, WEB_END, type ChatInputSpec, type WebState } from './web-flow';

export type ChatItem = { from: 'bot' | 'client'; text: string; at: string };

export type ChatView = { company: string; messages: ChatItem[]; input: ChatInputSpec };

export class ChatNotFoundError extends Error {}

const MAX_TRANSCRIPT = 300;
const MAX_TEXT = 500;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function startChat(rawAdCode: unknown): Promise<{ token: string; view: ChatView }> {
  const token = randomBytes(32).toString('base64url');
  const { state, messages } = startWebFlow();
  const items = botItems(messages);

  await prisma.webChat.create({
    data: {
      tokenHash: hashToken(token),
      adCode: normalizeAdCode(rawAdCode),
      state: state as unknown as Prisma.InputJsonValue,
      transcript: items as unknown as Prisma.InputJsonValue,
    },
  });
  return { token, view: { company: COMPANY_NAME, messages: items, input: inputFor(state) } };
}

export async function resumeChat(token: string): Promise<ChatView> {
  const chat = await prisma.webChat.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!chat) throw new ChatNotFoundError();
  const state = chat.state as unknown as WebState;
  return { company: COMPANY_NAME, messages: chat.transcript as unknown as ChatItem[], input: inputFor(state) };
}

export async function answerChat(token: string, input: BotInput): Promise<ChatView> {
  const chat = await prisma.webChat.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true } });
  if (!chat) throw new ChatNotFoundError();
  // Uma resposta por vez por conversa (dois toques rápidos não pulam pergunta).
  return withLeadLock(`webchat:${chat.id}`, () => processAnswer(chat.id, input));
}

async function processAnswer(chatId: string, input: BotInput): Promise<ChatView> {
  const chat = await prisma.webChat.findUniqueOrThrow({ where: { id: chatId } });
  const state = chat.state as unknown as WebState;
  const transcript = chat.transcript as unknown as ChatItem[];
  let pendingAnswers = chat.pendingAnswers as unknown as RecordedAnswer[];
  let leadId = chat.leadId;

  if (state.phase === 'done') return { company: COMPANY_NAME, messages: [], input: { kind: 'done' } };

  const clientItem: ChatItem = { from: 'client', text: clientText(state, input), at: new Date().toISOString() };
  const result = handleWebInput(state, input);
  let next = result.state;
  let messages = result.messages;
  let answer = result.answer;

  // 1. Contato informado: cria (ou encontra) o lead e grava o que veio antes.
  if (result.contact) {
    const origin = chat.adCode
      ? { source: 'REF_CODE' as const, post: chat.adCode, adId: null, adHeadline: null, refCode: chat.adCode }
      : null;
    const { lead, created } = await findOrCreateLeadByPhone({
      phone: result.contact.phone,
      name: result.contact.name,
      origin,
      channel: 'SITE',
    });
    leadId = lead.id;
    await recordMessages(leadId, [...transcript, clientItem]);
    await recordAnswers(leadId, pendingAnswers);
    pendingAnswers = [];
    if (!created) await notifyLeadReturned(leadId).catch((error) => console.error('[site] aviso de retorno', error));
  } else if (leadId) {
    await recordMessages(leadId, [clientItem]);
  }

  // 2. Horários e reserva da visita (precisam do lead e do corretor).
  let visit: { visit: Visit; brokerName: string } | null = null;
  let endKind: 'noSlots' | 'otherSlot' | 'booked' | null = null;

  if (leadId && next.status === 'ACTIVE' && next.engine.step === 'visit_slot' && state.engine.step !== 'visit_slot') {
    const offered = await offerSlots(leadId, asBotResult(next, messages, answer));
    ({ next, messages } = fromBotResult(next, offered));
    if (offered.status === 'COMPLETED') endKind = 'noSlots';
  }

  if (leadId && answer?.questionKey === 'visit_slot') {
    if (answer.answerKey === OTHER_SLOT_ID || answer.answerKey === NO_ANSWER_ID) {
      endKind = 'otherSlot';
    } else {
      visit = await bookSlot(leadId, new Date(answer.answerKey));
      if (visit) {
        endKind = 'booked';
      } else {
        // Reservado por outra pessoa no meio do caminho: mostra a lista atualizada.
        const retry = { ...state, engine: { ...state.engine, retryCount: 0 } };
        const offered = await offerSlots(leadId, asBotResult(retry, [], null), SLOT_TAKEN_PREFIX);
        ({ next, messages } = fromBotResult(retry, offered));
        if (offered.status === 'COMPLETED') endKind = 'noSlots';
        answer = null;
      }
    }
  }

  // 3. Respostas: no lead, ou guardadas até o contato chegar.
  if (answer) {
    if (leadId) await recordAnswers(leadId, [answer]);
    else pendingAnswers = [...pendingAnswers, answer];
  }

  // 4. Fim da qualificação: etapa, corretor, score e a mensagem final com o nome do corretor.
  if (leadId && next.status !== 'ACTIVE' && next.status !== 'DECLINED') {
    const brokerName = await finishQualification(leadId, next.status);
    if (visit) {
      await applyVisitStage(leadId);
      await notifyVisitBooked(visit.visit).catch((error) => console.error('[site] aviso de visita', error));
      messages = [{ type: 'text', body: WEB_END.booked(webVisitConfirmation(visit.visit, visit.brokerName), visit.brokerName) }];
    } else if (endKind === 'noSlots') {
      messages = [{ type: 'text', body: WEB_END.noSlots(brokerName) }];
    } else if (endKind === 'otherSlot') {
      messages = [{ type: 'text', body: WEB_END.otherSlot(brokerName) }];
    } else if (next.status === 'HANDED_OFF') {
      messages = [{ type: 'text', body: WEB_END.handedOff(brokerName) }];
    } else {
      messages = [{ type: 'text', body: WEB_END.completedNoVisit(brokerName) }];
    }
  }

  const replies = botItems(messages);
  if (leadId) await recordMessages(leadId, replies);

  await prisma.webChat.update({
    where: { id: chatId },
    data: {
      state: next as unknown as Prisma.InputJsonValue,
      transcript: [...transcript, clientItem, ...replies].slice(-MAX_TRANSCRIPT) as unknown as Prisma.InputJsonValue,
      pendingAnswers: pendingAnswers as unknown as Prisma.InputJsonValue,
      status: next.status,
      leadId,
    },
  });

  return { company: COMPANY_NAME, messages: [clientItem, ...replies], input: inputFor(next) };
}

/** Etapa só avança para lead novo; lead que voltou mantém a etapa em que estava. */
async function finishQualification(leadId: string, status: 'COMPLETED' | 'HANDED_OFF'): Promise<string | null> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true, temperature: true } });
  const target: LeadStage = status === 'COMPLETED' ? 'QUALIFIED' : 'IN_SERVICE';
  if (lead.stage === 'NEW') await changeLeadStage(leadId, target);
  await assignNextBroker(leadId);
  // Aviso de lead quente só quando ele passa a ser quente (cliente que volta não gera aviso repetido).
  try {
    const { temperature } = await scoreLead(leadId);
    if (temperature === 'HOT' && lead.temperature !== 'HOT') await notifyHotLead(leadId);
  } catch (error) {
    console.error(`[score] falha ao pontuar o lead ${leadId}`, error);
  }
  const withBroker = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { broker: { select: { name: true } } } });
  return withBroker.broker?.name ?? null;
}

async function applyVisitStage(leadId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
  const target = stageAfterVisitEvent('CREATED', lead.stage);
  if (target) await changeLeadStage(leadId, target);
}

/** Sem a frase "é só responder aqui": no site, a confirmação segue pelo WhatsApp do corretor. */
function webVisitConfirmation(visit: Visit, brokerName: string): string {
  const reference = visit.propertyReference ? `\nImóvel: ${visit.propertyReference}` : '';
  return `Visita marcada! 🏡\n\n${formatSlotLabel(visit.scheduledAt, SCHEDULE.timeZone)} com ${brokerName}.${reference}`;
}

// Carimbo sempre crescente: mensagens gravadas no mesmo milissegundo mantêm a ordem da conversa.
let lastStamp = 0;
const nextStamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

async function recordMessages(leadId: string, items: ChatItem[]) {
  if (items.length === 0) return;
  for (const item of items) {
    const sentAt = new Date(nextStamp());
    const created = await prisma.message.create({
      data: { leadId, direction: item.from === 'client' ? 'INBOUND' : 'OUTBOUND', type: 'web', body: item.text, sentAt },
    });
    void publishLeadMessage(toMessageDto(created));
  }
  await prisma.lead.update({ where: { id: leadId }, data: { lastMessageAt: new Date(lastStamp) } });
}

async function recordAnswers(leadId: string, answers: RecordedAnswer[]) {
  for (const { questionKey, answerKey, answerLabel } of answers) {
    await prisma.qualificationAnswer.upsert({
      where: { leadId_questionKey: { leadId, questionKey } },
      create: { leadId, questionKey, answerKey, answerLabel, points: 0 },
      update: { answerKey, answerLabel, points: 0 },
    });
  }
}

/** Texto que aparece como fala do cliente: o título do botão tocado ou o que ele digitou. */
function clientText(state: WebState, input: BotInput): string {
  if (input.kind === 'reply') {
    const spec = inputFor(state);
    const option = spec.kind === 'options' ? spec.options.find((o) => o.id === input.id) : undefined;
    return option?.title ?? 'Opção inválida';
  }
  if (input.kind === 'text') return input.text.slice(0, MAX_TEXT);
  return '';
}

function botItems(messages: OutgoingMessage[]): ChatItem[] {
  const at = new Date().toISOString();
  return messages.map((m) => ({ from: 'bot', text: m.body, at }));
}

function asBotResult(state: WebState, messages: OutgoingMessage[], answer: RecordedAnswer | null): BotResult {
  return { state: state.engine, status: 'ACTIVE', answer, messages };
}

function fromBotResult(state: WebState, result: BotResult): { next: WebState; messages: OutgoingMessage[] } {
  const finished = result.status !== 'ACTIVE';
  return {
    next: { ...state, engine: result.state, status: result.status, phase: finished ? 'done' : 'questions' },
    messages: result.messages,
  };
}

export const CHAT_LIMITS = { MAX_TEXT };
