import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { leadAccessWhere } from '../leads/lead-access';
import { LOSS_REASONS } from './deal-rules';
import { DealRuleError, registerLoss, registerWin, reopenLead, startNegotiation, undoWin } from './deal.service';

/** Rotas de negociação, montadas em /leads/:id */
export const dealsRouter = Router({ mergeParams: true });

type Handler = (leadId: string, req: Request<{ id: string }>) => Promise<void>;

function action(handler: Handler) {
  return async (req: Request<{ id: string }>, res: Response) => {
    const lead = await prisma.lead.findFirst({
      where: { AND: [{ id: req.params.id }, leadAccessWhere(req.user!)] },
      select: { id: true },
    });
    if (!lead) {
      res.status(404).json({ error: 'Lead não encontrado.' });
      return;
    }
    try {
      await handler(lead.id, req);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof DealRuleError) {
        res.status(400).json({ error: error.errors.join(' '), details: error.errors });
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Confira os dados do formulário.' });
        return;
      }
      throw error;
    }
  };
}

const winSchema = z.object({
  value: z.number(),
  kind: z.enum(['SALE', 'RENT']),
  propertyReference: z.string().optional().nullable(),
});

const lossSchema = z.object({
  reason: z.enum(LOSS_REASONS as [string, ...string[]]),
  notes: z.string().optional().nullable(),
});

const actor = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

dealsRouter.post('/negotiation', action((leadId, req) => startNegotiation(leadId, actor(req))));
dealsRouter.post('/won', action((leadId, req) => registerWin(leadId, winSchema.parse(req.body), actor(req))));
dealsRouter.post(
  '/lost',
  action((leadId, req) => {
    const input = lossSchema.parse(req.body);
    return registerLoss(leadId, { reason: input.reason as never, notes: input.notes }, actor(req));
  }),
);
dealsRouter.post('/reopen', action((leadId, req) => reopenLead(leadId, actor(req))));
dealsRouter.post('/undo-win', action((leadId, req) => undoWin(leadId, actor(req))));
