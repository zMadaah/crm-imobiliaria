import { Prisma, type UserRole, type Visit, type VisitSource } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { changeLeadStage } from '../leads/lead-stage.service';
import { realtimeBus } from '../notifications/notification-bus';
import { toNotificationEvent } from '../notifications/notification.service';
import { SCHEDULE } from './schedule-config';
import { generateFreeSlots, type Slot } from './slots';
import {
  BLOCKING_STATUSES,
  stageAfterVisitEvent,
  validateOutcome,
  type OutcomeInput,
} from './visit-rules';
import { formatSlotLabel } from './zoned-time';

type Db = Prisma.TransactionClient | typeof prisma;

export class VisitConflictError extends Error {
  constructor(message = 'O corretor já tem uma visita nesse horário.') {
    super(message);
  }
}

export class VisitValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors[0] ?? 'Dados inválidos.');
  }
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: SCHEDULE.timeZone, hour: '2-digit', minute: '2-digit' });

async function assertNoConflict(db: Db, brokerId: string, start: Date, end: Date, ignoreId?: string) {
  const conflict = await db.visit.findFirst({
    where: {
      brokerId,
      status: { in: BLOCKING_STATUSES },
      scheduledAt: { lt: end },
      endsAt: { gt: start },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { scheduledAt: true, endsAt: true, broker: { select: { name: true } } },
  });
  if (conflict) {
    throw new VisitConflictError(
      `${conflict.broker.name} já tem visita das ${timeFormat.format(conflict.scheduledAt)} às ${timeFormat.format(conflict.endsAt)} nesse dia.`,
    );
  }
}

/** A trava do banco (visits_no_overlap) pega o caso de duas reservas no mesmo instante. */
function isOverlapViolation(error: unknown): boolean {
  return error instanceof Error && /visits_no_overlap|23P01/.test(error.message);
}

export type CreateVisitInput = {
  leadId: string;
  brokerId: string;
  start: Date;
  durationMinutes: number;
  propertyReference?: string | null;
  createdById: string | null;
  source: VisitSource;
  rescheduledFromId?: string | null;
};

export async function createVisit(input: CreateVisitInput, options: { applyStage?: boolean } = {}): Promise<Visit> {
  const end = new Date(input.start.getTime() + input.durationMinutes * 60_000);

  let visit: Visit;
  try {
    visit = await prisma.$transaction(async (tx) => {
      await assertNoConflict(tx, input.brokerId, input.start, end);
      return tx.visit.create({
        data: {
          leadId: input.leadId,
          brokerId: input.brokerId,
          scheduledAt: input.start,
          endsAt: end,
          propertyReference: input.propertyReference?.trim() || null,
          createdById: input.createdById,
          source: input.source,
          rescheduledFromId: input.rescheduledFromId ?? null,
        },
      });
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new VisitConflictError();
    throw error;
  }

  if (options.applyStage !== false) await applyStage(visit.leadId, 'CREATED', input.createdById);
  publishVisitChanged(visit.brokerId);
  return visit;
}

async function applyStage(leadId: string, event: Parameters<typeof stageAfterVisitEvent>[0], userId: string | null) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { stage: true } });
  const next = stageAfterVisitEvent(event, lead.stage);
  if (next) await changeLeadStage(leadId, next, userId);
}

export async function recordOutcome(visitId: string, input: OutcomeInput, userId: string): Promise<Visit> {
  const visit = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } });
  const errors = validateOutcome(visit, input);
  if (errors.length > 0) throw new VisitValidationError(errors);

  const feedback = input.feedback?.trim() || null;
  const updated = await prisma.visit.update({
    where: { id: visitId, status: 'SCHEDULED' },
    data: { status: input.status, feedback, outcomeAt: new Date() },
  });

  if (input.status === 'RESCHEDULED') {
    const duration = Math.round((visit.endsAt.getTime() - visit.scheduledAt.getTime()) / 60_000);
    try {
      await createVisit(
        {
          leadId: visit.leadId,
          brokerId: visit.brokerId,
          start: input.newStartsAt!,
          durationMinutes: duration,
          propertyReference: visit.propertyReference,
          createdById: userId,
          source: 'PANEL',
          rescheduledFromId: visit.id,
        },
        { applyStage: false },
      );
    } catch (error) {
      // Novo horário ocupado: desfaz a marcação de remarcada.
      await prisma.visit.update({ where: { id: visitId }, data: { status: 'SCHEDULED', feedback: visit.feedback, outcomeAt: null } });
      throw error;
    }
  }

  await applyStage(visit.leadId, input.status, userId);
  publishVisitChanged(visit.brokerId);
  return updated;
}

/** Horários livres de um corretor pelo expediente (usado pelo bot). */
export async function freeSlotsForBroker(brokerId: string, now: Date = new Date()): Promise<Slot[]> {
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const busy = await prisma.visit.findMany({
    where: { brokerId, status: { in: BLOCKING_STATUSES }, endsAt: { gt: now }, scheduledAt: { lt: horizon } },
    select: { scheduledAt: true, endsAt: true },
  });
  return generateFreeSlots({
    now,
    busy: busy.map((v) => ({ start: v.scheduledAt, end: v.endsAt })),
    config: SCHEDULE,
  });
}

export async function notifyVisitBooked(visit: Visit): Promise<void> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: visit.leadId }, select: { name: true, phone: true } });
  const notification = await prisma.notification.create({
    data: {
      userId: visit.brokerId,
      leadId: visit.leadId,
      type: 'VISIT_BOOKED',
      title: `Visita marcada: ${lead.name ?? lead.phone}`,
      body: `${formatSlotLabel(visit.scheduledAt, SCHEDULE.timeZone)}${visit.propertyReference ? `. Imóvel: ${visit.propertyReference}` : ''}.`,
    },
  });
  realtimeBus.publish(visit.brokerId, 'notification', toNotificationEvent(notification));
}

/** Avisa a agenda e o aviso de pendências do corretor e dos donos. */
export function publishVisitChanged(brokerId: string): void {
  void prisma.user
    .findMany({ where: { role: 'OWNER', active: true }, select: { id: true } })
    .then((owners) => {
      const recipients = new Set([brokerId, ...owners.map((o) => o.id)]);
      for (const userId of recipients) realtimeBus.publish(userId, 'visit', { brokerId });
    })
    .catch((error) => console.error('[tempo real] falha ao publicar visita', error));
}

export function visitAccessWhere(user: { id: string; role: UserRole }): Prisma.VisitWhereInput {
  return user.role === 'OWNER' ? {} : { brokerId: user.id };
}

export function visitConfirmationText(visit: { scheduledAt: Date; propertyReference: string | null }, brokerName: string) {
  const reference = visit.propertyReference ? `\nImóvel: ${visit.propertyReference}` : '';
  return `Visita marcada! 🏡\n\n${formatSlotLabel(visit.scheduledAt, SCHEDULE.timeZone)} com ${brokerName}.${reference}\n\nSe precisar remarcar, é só responder aqui.`;
}
