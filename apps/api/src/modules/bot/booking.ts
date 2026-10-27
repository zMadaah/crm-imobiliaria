/**
 * Partes do fluxo que dependem do banco e servem aos dois canais (WhatsApp e site):
 * horários livres do corretor, reserva da visita e score no fim da qualificação.
 */
import type { Visit } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assignNextBroker } from '../leads/assignment.service';
import { suggestedPropertyReference } from '../leads/lead-origin';
import { notifyHotLead } from '../notifications/notification.service';
import { scoreLead } from '../scoring/scoring.service';
import { SCHEDULE } from '../visits/schedule-config';
import { createVisit, freeSlotsForBroker, VisitConflictError } from '../visits/visit.service';
import { formatSlotLabel } from '../visits/zoned-time';
import { renderStep, type BotResult } from './bot-engine';
import { END_MESSAGES, type BotContext } from './qualification-flow';

/**
 * Coloca os horários livres do corretor no passo visit_slot.
 * Sem corretor ou sem horário livre, conclui avisando que o corretor vai combinar.
 */
export async function offerSlots(leadId: string, result: BotResult, prefix?: string): Promise<BotResult> {
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

export async function bookSlot(leadId: string, start: Date): Promise<{ visit: Visit; brokerName: string } | null> {
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
export async function scoreAndNotify(leadId: string) {
  try {
    const { temperature } = await scoreLead(leadId);
    if (temperature === 'HOT') await notifyHotLead(leadId);
  } catch (error) {
    console.error(`[score] falha ao pontuar o lead ${leadId}`, error);
  }
}

