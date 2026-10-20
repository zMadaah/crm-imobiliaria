import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../auth/auth.middleware';
import { leadAccessWhere } from '../leads/lead-access';
import { getServiceWindow } from '../leads/service-window';
import { sendAndRecord } from '../whatsapp/outbound.service';
import { isPendingOutcome, MAX_DURATION, MIN_DURATION } from './visit-rules';
import {
  createVisit,
  recordOutcome,
  visitAccessWhere,
  visitConfirmationText,
  VisitConflictError,
  VisitValidationError,
} from './visit.service';

export const visitsRouter = Router();
visitsRouter.use(requireAuth);

const visitSelect = {
  id: true,
  scheduledAt: true,
  endsAt: true,
  status: true,
  feedback: true,
  source: true,
  propertyReference: true,
  rescheduledFromId: true,
  lead: { select: { id: true, name: true, phone: true } },
  broker: { select: { id: true, name: true } },
} as const;

type VisitRow = { scheduledAt: Date; endsAt: Date; status: string } & Record<string, unknown>;

function toDto<T extends VisitRow>(visit: T) {
  return {
    ...visit,
    scheduledAt: visit.scheduledAt.toISOString(),
    endsAt: visit.endsAt.toISOString(),
    pending: isPendingOutcome(visit as never),
  };
}

const rangeQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  brokerId: z.string().uuid().optional(),
});

/** Agenda: visitas de um período. Corretor vê só as dele; dono escolhe o corretor. */
visitsRouter.get('/', async (req, res) => {
  const parsed = rangeQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Período inválido.' });
    return;
  }
  const user = req.user!;
  const brokerFilter = user.role === 'OWNER' ? (parsed.data.brokerId ? { brokerId: parsed.data.brokerId } : {}) : { brokerId: user.id };

  const visits = await prisma.visit.findMany({
    where: {
      ...brokerFilter,
      scheduledAt: { lt: new Date(parsed.data.to) },
      endsAt: { gt: new Date(parsed.data.from) },
    },
    orderBy: { scheduledAt: 'asc' },
    select: visitSelect,
  });
  res.json({ items: visits.map(toDto) });
});

/** Visitas que já terminaram e ainda não tiveram o resultado registrado. */
visitsRouter.get('/pending', async (req, res) => {
  const visits = await prisma.visit.findMany({
    where: { ...visitAccessWhere(req.user!), status: 'SCHEDULED', endsAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    select: visitSelect,
  });
  res.json({ items: visits.map(toDto) });
});

/** Corretores ativos, para o seletor da agenda do dono. */
visitsRouter.get('/brokers', async (req, res) => {
  const user = req.user!;
  const brokers = await prisma.user.findMany({
    where: { role: 'BROKER', active: true, ...(user.role === 'OWNER' ? {} : { id: user.id }) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  res.json({ items: brokers });
});

const createSchema = z.object({
  leadId: z.string().uuid(),
  brokerId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(MIN_DURATION).max(MAX_DURATION),
  propertyReference: z.string().trim().max(120).optional().nullable(),
  notifyClient: z.boolean().optional(),
});

visitsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Confira lead, data, hora e duração (de ${MIN_DURATION} a ${MAX_DURATION} minutos).` });
    return;
  }
  const user = req.user!;
  const input = parsed.data;
  const start = new Date(input.startsAt);
  if (start.getTime() <= Date.now()) {
    res.status(400).json({ error: 'Escolha um horário no futuro.' });
    return;
  }

  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id: input.leadId }, leadAccessWhere(user)] },
    select: { id: true, phone: true, brokerId: true, lastInboundAt: true },
  });
  if (!lead) {
    res.status(404).json({ error: 'Lead não encontrado.' });
    return;
  }

  // A visita é sempre do corretor do lead. Lead sem corretor: o dono escolhe e o lead fica com ele.
  let brokerId = lead.brokerId;
  if (!brokerId) {
    if (user.role !== 'OWNER' || !input.brokerId) {
      res.status(400).json({ error: 'Escolha o corretor que vai fazer a visita.' });
      return;
    }
    const broker = await prisma.user.findFirst({ where: { id: input.brokerId, role: 'BROKER', active: true } });
    if (!broker) {
      res.status(400).json({ error: 'Corretor não encontrado.' });
      return;
    }
    brokerId = broker.id;
    await prisma.lead.update({ where: { id: lead.id }, data: { brokerId } });
  }

  try {
    const visit = await createVisit({
      leadId: lead.id,
      brokerId,
      start,
      durationMinutes: input.durationMinutes,
      propertyReference: input.propertyReference,
      createdById: user.id,
      source: 'PANEL',
    });

    let clientNotified = false;
    if (input.notifyClient && getServiceWindow(lead.lastInboundAt).open) {
      const broker = await prisma.user.findUniqueOrThrow({ where: { id: brokerId }, select: { name: true } });
      try {
        await sendAndRecord({
          leadId: lead.id,
          phone: lead.phone,
          sentById: user.id,
          message: { type: 'text', body: visitConfirmationText(visit, broker.name) },
        });
        clientNotified = true;
      } catch (error) {
        console.error('[visitas] falha ao avisar o cliente', error);
      }
    }

    const created = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, select: visitSelect });
    res.status(201).json({ visit: toDto(created), clientNotified });
  } catch (error) {
    if (error instanceof VisitConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});

const outcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('DONE'), feedback: z.string().optional().nullable() }),
  z.object({ status: z.literal('NO_SHOW'), feedback: z.string().optional().nullable() }),
  z.object({ status: z.literal('RESCHEDULED'), feedback: z.string().optional().nullable(), newStartsAt: z.string().datetime() }),
]);

visitsRouter.post('/:id/outcome', async (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Escolha como foi a visita.' });
    return;
  }

  const visit = await prisma.visit.findFirst({
    where: { id: req.params.id, ...visitAccessWhere(req.user!) },
    select: { id: true },
  });
  if (!visit) {
    res.status(404).json({ error: 'Visita não encontrada.' });
    return;
  }

  const input =
    parsed.data.status === 'RESCHEDULED'
      ? { ...parsed.data, newStartsAt: new Date(parsed.data.newStartsAt) }
      : parsed.data;

  try {
    await recordOutcome(visit.id, input, req.user!.id);
    const updated = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, select: visitSelect });
    res.json({ visit: toDto(updated) });
  } catch (error) {
    if (error instanceof VisitValidationError) {
      res.status(400).json({ error: error.errors.join(' '), details: error.errors });
      return;
    }
    if (error instanceof VisitConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
});
