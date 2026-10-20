import type { LeadTemperature } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { allWeightKeys, buildWeightGroups } from './default-weights';
import {
  calculateScore,
  HOT_THRESHOLD,
  MAX_SCORE,
  validateWeightUpdates,
  WARM_THRESHOLD,
  weightKey,
  type WeightUpdate,
} from './score-calculator';

/** Cria os pesos padrão que faltam no banco. Nunca sobrescreve o que o dono editou. */
export async function syncDefaultWeights(): Promise<number> {
  const result = await prisma.scoreWeight.createMany({
    data: allWeightKeys().map(({ questionKey, answerKey, defaultPoints }) => ({
      questionKey,
      answerKey,
      points: defaultPoints,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function loadWeights(): Promise<Map<string, number>> {
  const rows = await prisma.scoreWeight.findMany({ select: { questionKey: true, answerKey: true, points: true } });
  return new Map(rows.map((row) => [weightKey(row.questionKey, row.answerKey), row.points]));
}

/**
 * Calcula o score do lead com os pesos atuais e congela os pontos em cada resposta.
 * Mudanças futuras de peso não alteram este lead.
 */
export async function scoreLead(leadId: string): Promise<{ score: number; temperature: LeadTemperature }> {
  const weights = await loadWeights();

  return prisma.$transaction(async (tx) => {
    const answers = await tx.qualificationAnswer.findMany({
      where: { leadId },
      select: { id: true, questionKey: true, answerKey: true, points: true },
    });
    const result = calculateScore(answers, weights);

    for (const [index, answer] of answers.entries()) {
      const points = result.breakdown[index].points;
      if (answer.points !== points) {
        await tx.qualificationAnswer.update({ where: { id: answer.id }, data: { points } });
      }
    }

    await tx.lead.update({
      where: { id: leadId },
      data: { score: result.score, temperature: result.temperature },
    });

    return { score: result.score, temperature: result.temperature };
  });
}

export async function getWeightSettings() {
  const weights = await loadWeights();
  return {
    thresholds: { hot: HOT_THRESHOLD, warm: WARM_THRESHOLD },
    maxScore: MAX_SCORE,
    groups: buildWeightGroups().map((group) => ({
      ...group,
      answers: group.answers.map((answer) => ({
        ...answer,
        points: weights.get(weightKey(group.questionKey, answer.answerKey)) ?? answer.defaultPoints,
      })),
    })),
  };
}

export class WeightValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super('Pesos inválidos');
  }
}

export async function updateWeights(updates: WeightUpdate[], userId: string): Promise<void> {
  const allowed = new Set(allWeightKeys().map((k) => weightKey(k.questionKey, k.answerKey)));
  const errors = validateWeightUpdates(updates, allowed);
  if (errors.length > 0) throw new WeightValidationError(errors);

  await prisma.$transaction(
    updates.map(({ questionKey, answerKey, points }) =>
      prisma.scoreWeight.upsert({
        where: { questionKey_answerKey: { questionKey, answerKey } },
        create: { questionKey, answerKey, points, updatedById: userId },
        update: { points, updatedById: userId },
      }),
    ),
  );
}
