import type { LeadStage, LeadTemperature, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../auth/auth.middleware';
import { isStepKey, questionTitle, STEP_KEYS } from '../bot/qualification-flow';
import { originLabel, suggestedPropertyReference } from './lead-origin';
import { leadAccessWhere } from './lead-access';
import { leadMessagesRouter } from './lead-messages.routes';
import { dealsRouter } from '../deals/deals.routes';
import { allowedDealActions, defaultDealKind, LOSS_REASON_LABEL } from '../deals/deal-rules';
import { getServiceWindow } from './service-window';
import { isPendingOutcome } from '../visits/visit-rules';

export const leadsRouter = Router();
leadsRouter.use(requireAuth);
leadsRouter.use('/:id/messages', leadMessagesRouter);
leadsRouter.use('/:id/deals', dealsRouter);

const PAGE_SIZE = 30;
const STAGES = ['NEW', 'QUALIFIED', 'IN_SERVICE', 'VISIT_SCHEDULED', 'VISIT_DONE', 'NEGOTIATION', 'WON', 'LOST'] as const;

const listQuery = z.object({
  temperature: z.enum(['HOT', 'WARM', 'COLD', 'NONE']).optional(),
  stage: z.enum(STAGES).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
});

leadsRouter.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Filtros inválidos.' });
    return;
  }
  const { temperature, stage, q, cursor } = parsed.data;
  const user = req.user!;

  const filters: Prisma.LeadWhereInput[] = [leadAccessWhere(user)];
  if (temperature) filters.push({ temperature: temperature === 'NONE' ? null : (temperature as LeadTemperature) });
  if (stage) filters.push({ stage: stage as LeadStage });
  if (q) {
    const digits = q.replace(/\D/g, '');
    filters.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }

  const leads = await prisma.lead.findMany({
    where: { AND: filters },
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      phone: true,
      channel: true,
      score: true,
      temperature: true,
      stage: true,
      originPost: true,
      originSource: true,
      originAdId: true,
      originRef: true,
      ad: { select: { name: true, headline: true, propertyReference: true } },
      lastMessageAt: true,
      broker: { select: { id: true, name: true } },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: { body: true, type: true, direction: true, sentAt: true },
      },
      reads: { where: { userId: user.id }, select: { lastReadAt: true } },
    },
  });

  const page = leads.slice(0, PAGE_SIZE);
  const items = await Promise.all(
    page.map(async ({ messages, reads, ad, originAdId, originRef, ...lead }) => ({
      ...lead,
      originLabel: originLabel({ ...lead, originAdId, originRef, ad }),
      lastMessageAt: lead.lastMessageAt?.toISOString() ?? null,
      lastMessage: messages[0]
        ? { ...messages[0], sentAt: messages[0].sentAt.toISOString() }
        : null,
      unreadCount: await prisma.message.count({
        where: {
          leadId: lead.id,
          direction: 'INBOUND',
          ...(reads[0] ? { sentAt: { gt: reads[0].lastReadAt } } : {}),
        },
      }),
    })),
  );

  res.json({ items, nextCursor: leads.length > PAGE_SIZE ? page[page.length - 1].id : null });
});

leadsRouter.get('/:id', async (req, res) => {
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id: req.params.id }, leadAccessWhere(req.user!)] },
    include: {
      ad: { select: { name: true, headline: true, propertyReference: true } },
      broker: { select: { id: true, name: true } },
      answers: true,
      botSession: { select: { status: true, currentStep: true } },
      stageHistory: {
        orderBy: { changedAt: 'asc' },
        include: { changedBy: { select: { name: true } } },
      },
      deals: {
        orderBy: { closedAt: 'desc' },
        include: { closedBy: { select: { name: true } }, broker: { select: { name: true } } },
      },
      visits: {
        orderBy: { scheduledAt: 'desc' },
        select: {
          id: true,
          scheduledAt: true,
          endsAt: true,
          status: true,
          feedback: true,
          source: true,
          propertyReference: true,
          broker: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!lead) {
    res.status(404).json({ error: 'Lead não encontrado.' });
    return;
  }

  const order = (key: string) => (isStepKey(key) ? STEP_KEYS.indexOf(key) : STEP_KEYS.length);
  const window = getServiceWindow(lead.lastInboundAt);

  res.json({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    channel: lead.channel,
    score: lead.score,
    temperature: lead.temperature,
    stage: lead.stage,
    originPost: lead.originPost,
    originSource: lead.originSource,
    originLabel: originLabel(lead),
    propertyReference: suggestedPropertyReference(lead),
    createdAt: lead.createdAt.toISOString(),
    broker: lead.broker,
    botStatus: lead.botSession?.status ?? null,
    serviceWindow: { open: window.open, closesAt: window.closesAt?.toISOString() ?? null },
    answers: lead.answers
      .sort((a, b) => order(a.questionKey) - order(b.questionKey))
      .map((answer) => ({
        questionKey: answer.questionKey,
        question: questionTitle(answer.questionKey),
        answer: answer.answerLabel,
        points: answer.points,
      })),
    actions: allowedDealActions(lead.stage, req.user!.role),
    defaultDealKind: defaultDealKind(lead.answers.find((a) => a.questionKey === 'intent')?.answerKey),
    deals: lead.deals.map((deal) => ({
      id: deal.id,
      result: deal.result,
      kind: deal.kind,
      value: deal.value?.toFixed(2) ?? null,
      lossReason: deal.lossReason,
      lossReasonLabel: deal.lossReason ? LOSS_REASON_LABEL[deal.lossReason] : null,
      notes: deal.notes,
      propertyReference: deal.propertyReference,
      broker: deal.broker?.name ?? null,
      closedBy: deal.closedBy?.name ?? null,
      closedAt: deal.closedAt.toISOString(),
      voidedAt: deal.voidedAt?.toISOString() ?? null,
    })),
    visits: lead.visits.map((visit) => ({
      ...visit,
      scheduledAt: visit.scheduledAt.toISOString(),
      endsAt: visit.endsAt.toISOString(),
      pending: isPendingOutcome(visit),
    })),
    stageHistory: lead.stageHistory.map((item) => ({
      fromStage: item.fromStage,
      toStage: item.toStage,
      changedBy: item.changedBy?.name ?? null,
      changedAt: item.changedAt.toISOString(),
    })),
  });
});

leadsRouter.post('/:id/read', async (req, res) => {
  const user = req.user!;
  const lead = await prisma.lead.findFirst({
    where: { AND: [{ id: req.params.id }, leadAccessWhere(user)] },
    select: { id: true },
  });
  if (!lead) {
    res.status(404).json({ error: 'Lead não encontrado.' });
    return;
  }

  const now = new Date();
  await prisma.leadRead.upsert({
    where: { userId_leadId: { userId: user.id, leadId: lead.id } },
    create: { userId: user.id, leadId: lead.id, lastReadAt: now },
    update: { lastReadAt: now },
  });
  res.json({ lastReadAt: now.toISOString() });
});
