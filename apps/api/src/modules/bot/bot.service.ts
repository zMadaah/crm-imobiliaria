import type { LeadStage, Prisma, UserRole, Visit } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assignNextBroker } from '../leads/assignment.service';
import { notifyHotLead } from '../notifications/notification.service';
import { scoreLead } from '../scoring/scoring.service';
import { SCHEDULE } from '../visits/schedule-config';
import {
  createVisit,
  freeSlotsForBroker,
  notifyVisitBooked,
  visitConfirmationText,
  VisitConflictError,
} from '../visits/visit.service';
import { formatSlotLabel } from '../visits/zoned-time';
import { decideHumanReplyEffects } from '../leads/human-reply';
import { suggestedPropertyReference } from '../leads/lead-origin';
import { changeLeadStage } from '../leads/lead-stage.service';
import { sendAndRecord } from '../whatsapp/outbound.service';
import type { WaMessage } from '../whatsapp/webhook.types';
import { handleInput, renderStep, startConversation, type BotInput, type BotResult, type BotState } from './bot-engine';
import { withLeadLock } from './lead-lock';
import { END_MESSAGES, isStepKey, NO_ANSWER_ID, OTHER_SLOT_ID, SLOT_TAKEN_PREFIX, type BotContext } from './qualification-flow';

type BotParams = {
  leadId: string;
  phone: string;
  message: WaMessage;
};

const STAGE_AFTER: Partial<Record<BotResult['status'], LeadStage>> = {
  COMPLETED: 'QUALIFIED',
  HANDED_OFF: 'IN_SERVICE',
};

/** Ponto de entrada: chamado para cada mensagem nova recebida. */
export function runBotForInboundMessage(params: BotParams): Promise<void> {
  return withLeadLock(params.leadId, () => processMessage(params));
}

export function toBotInput(message: WaMessage): BotInput {
  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
    if (reply) return { kind: 'reply', id: reply.id };
  }
  if (message.type === 'text' && message.text?.body) {
    return { kind: 'text', text: message.text.body };
  }
  // Áudio, foto, figurinha, localização...
  return { kind: 'other' };
}

async function processMessage({ leadId, phone, message }: BotParams): Promise<void> {
  const session = await prisma.botSession.findUnique({ where: { leadId } });

  if (!session) {
    // Só inicia o bot para leads novos. Lead já em atendimento não recebe o bot.
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
    if (lead.stage !== 'NEW') return;

    const result = startConversation();
    await prisma.botSession.create({
      data: {
        leadId,
        currentStep: result.state.step,
        retryCount: result.state.retryCount,
        context: result.state.context as unknown as Prisma.InputJsonValue,
      },
    });
    await sendMessages(leadId, phone, result);
    return;
  }

  // Fluxo concluído ou encaminhado: o bot fica em silêncio, a conversa segue no painel.
  if (session.status !== 'ACTIVE') return;

  // Conversa parada numa pergunta que saiu do fluxo (troca de perguntas): recomeça do início.
  if (!isStepKey(session.currentStep)) {
    console.warn(`[bot] passo "${session.currentStep}" não existe mais; recomeçando o fluxo do lead ${leadId}`);
    const restart = startConversation();
    await prisma.botSession.update({
      where: { leadId },
      data: {
        currentStep: restart.state.step,
        retryCount: 0,
        context: restart.state.context as unknown as Prisma.InputJsonValue,
      },
    });
    await sendMessages(leadId, phone, restart);
    return;
  }

  const state: BotState = {
    step: session.currentStep,
    retryCount: session.retryCount,
    context: normalizeContext(session.context),
  };
  let result = handleInput(state, toBotInput(message));
  let bookedVisit: Visit | null = null;

  // Cliente aceitou visitar: escolhe o corretor agora e oferece os horários livres dele.
  if (result.status === 'ACTIVE' && result.state.step === 'visit_slot' && state.step !== 'visit_slot') {
    result = await offerSlots(leadId, result);
  }

  // Cliente escolheu um horário: tenta reservar.
  const chosen = result.answer?.questionKey === 'visit_slot' ? result.answer.answerKey : null;
  if (chosen && chosen !== OTHER_SLOT_ID && chosen !== NO_ANSWER_ID) {
    const booking = await bookSlot(leadId, new Date(chosen));
    if (booking) {
      bookedVisit = booking.visit;
      result = { ...result, messages: [{ type: 'text', body: visitConfirmationText(booking.visit, booking.brokerName) }] };
    } else {
      // Alguém reservou esse horário no meio do caminho: mostra a lista atualizada.
      result = await offerSlots(
        leadId,
        { ...result, status: 'ACTIVE', answer: null, state: { ...state, retryCount: 0 } },
        SLOT_TAKEN_PREFIX,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (result.answer) {
      const { questionKey, answerKey, answerLabel } = result.answer;
      // Pontos entram como 0 e são preenchidos pelo cálculo do score no fim do fluxo.
      await tx.qualificationAnswer.upsert({
        where: { leadId_questionKey: { leadId, questionKey } },
        create: { leadId, questionKey, answerKey, answerLabel, points: 0 },
        update: { answerKey, answerLabel, points: 0 },
      });
    }

    await tx.botSession.update({
      where: { leadId },
      data: {
        currentStep: result.state.step,
        retryCount: result.state.retryCount,
        context: result.state.context as unknown as Prisma.InputJsonValue,
        status: result.status,
        finishedAt: result.status === 'ACTIVE' ? null : new Date(),
      },
    });
  });

  const nextStage = STAGE_AFTER[result.status];
  if (nextStage) {
    await changeLeadStage(leadId, nextStage);
    await assignNextBroker(leadId);
    await scoreAndNotify(leadId);
  }

  if (bookedVisit) {
    await changeLeadStage(leadId, 'VISIT_SCHEDULED');
    await notifyVisitBooked(bookedVisit).catch((error) => console.error('[visitas] falha ao notificar', error));
  }

  await sendMessages(leadId, phone, result);
}

/**
 * Coloca os horários livres do corretor no passo visit_slot.
 * Sem corretor ou sem horário livre, conclui avisando que o corretor vai combinar.
 */
async function offerSlots(leadId: string, result: BotResult, prefix?: string): Promise<BotResult> {
  const brokerId = await assignNextBroker(leadId);
  const slots = brokerId ? await freeSlotsForBroker(brokerId) : [];

  if (slots.length === 0) {
    return { ...result, status: 'COMPLETED', messages: [{ type: 'text', body: END_MESSAGES.visitYes }] };
  }

  const context: BotContext = {
    ...result.state.context,
    slots: slots.map((slot) => ({ id: slot.start.toISOString(), label: formatSlotLabel(slot.start, SCHEDULE.timeZone) })),
  };
  return {
    ...result,
    status: 'ACTIVE',
    state: { step: 'visit_slot', retryCount: 0, context },
    messages: [renderStep('visit_slot', context, prefix)],
  };
}

async function bookSlot(leadId: string, start: Date): Promise<{ visit: Visit; brokerName: string } | null> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      brokerId: true,
      originPost: true,
      originSource: true,
      originAdId: true,
      originRef: true,
      ad: { select: { name: true, headline: true, propertyReference: true } },
      broker: { select: { name: true } },
    },
  });
  if (!lead.brokerId || !lead.broker) return null;

  try {
    const visit = await createVisit(
      {
        leadId,
        brokerId: lead.brokerId,
        start,
        durationMinutes: SCHEDULE.visitMinutes,
        propertyReference: suggestedPropertyReference(lead),
        createdById: null,
        source: 'BOT',
      },
      { applyStage: false },
    );
    return { visit, brokerName: lead.broker.name };
  } catch (error) {
    if (error instanceof VisitConflictError) return null;
    throw error;
  }
}

/** Uma falha no score não pode impedir o bot de responder ao cliente. */
async function scoreAndNotify(leadId: string) {
  try {
    const { temperature } = await scoreLead(leadId);
    if (temperature === 'HOT') await notifyHotLead(leadId);
  } catch (error) {
    console.error(`[score] falha ao pontuar o lead ${leadId}`, error);
  }
}

async function sendMessages(leadId: string, phone: string, result: BotResult) {
  for (const message of result.messages) {
    try {
      await sendAndRecord({ leadId, phone, message });
    } catch (error) {
      // O estado já foi salvo. Se a pessoa escrever de novo, o bot reenvia a pergunta atual.
      console.error(`[bot] falha ao enviar mensagem para o lead ${leadId}`, error);
    }
  }
}

function normalizeContext(value: Prisma.JsonValue): BotContext {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'answers' in value) {
    return value as unknown as BotContext;
  }
  return { answers: {} };
}

/**
 * Alguém da equipe vai responder o cliente pelo painel.
 * Para o bot se ele estiver no meio do fluxo, move o lead para "em atendimento"
 * e atribui um corretor se ele estava sem. Chamar dentro de withLeadLock.
 */
export async function prepareLeadForHumanReply(leadId: string, replier: { id: string; role: UserRole }) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { stage: true, brokerId: true, botSession: { select: { status: true } } },
  });

  const effects = decideHumanReplyEffects({
    botStatus: lead.botSession?.status ?? null,
    stage: lead.stage,
    brokerId: lead.brokerId,
    replier,
  });

  if (effects.stopBot) {
    await prisma.botSession.update({
      where: { leadId },
      data: { status: 'HANDED_OFF', finishedAt: new Date() },
    });
  }
  if (effects.newStage) await changeLeadStage(leadId, effects.newStage, replier.id);

  if (effects.assign === 'replier') {
    await prisma.$transaction([
      prisma.lead.update({ where: { id: leadId }, data: { brokerId: replier.id } }),
      prisma.user.update({ where: { id: replier.id }, data: { lastLeadAssignedAt: new Date() } }),
    ]);
  } else if (effects.assign === 'rotation') {
    await assignNextBroker(leadId);
  }

  if (effects.rescore) {
    try {
      await scoreLead(leadId);
    } catch (error) {
      console.error(`[score] falha ao pontuar o lead ${leadId}`, error);
    }
  }
}
