import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { getWeightSettings, updateWeights, WeightValidationError } from './scoring.service';

export const scoreWeightsRouter = Router();

scoreWeightsRouter.use(requireAuth, requireRole('OWNER'));

scoreWeightsRouter.get('/', async (_req, res) => {
  res.json(await getWeightSettings());
});

const updateSchema = z.object({
  weights: z
    .array(
      z.object({
        questionKey: z.string().min(1),
        answerKey: z.string().min(1),
        points: z.number(),
      }),
    )
    .min(1),
});

scoreWeightsRouter.put('/', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Envie a lista de pesos.' });
    return;
  }

  try {
    await updateWeights(parsed.data.weights, req.user!.id);
  } catch (error) {
    if (error instanceof WeightValidationError) {
      res.status(400).json({ error: 'Alguns pesos são inválidos.', details: error.errors });
      return;
    }
    throw error;
  }

  res.json(await getWeightSettings());
});
