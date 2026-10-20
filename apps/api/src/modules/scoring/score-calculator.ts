/**
 * Cálculo do score. Função pura: recebe respostas e pesos, devolve score e temperatura.
 */
import type { LeadTemperature } from '@prisma/client';
import { NO_ANSWER_ID } from '../bot/qualification-flow';

export const HOT_THRESHOLD = 70;
export const WARM_THRESHOLD = 40;
export const MAX_SCORE = 100;
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 100;

export type AnswerInput = { questionKey: string; answerKey: string };
export type WeightLookup = ReadonlyMap<string, number>;

export type ScoreResult = {
  score: number;
  temperature: LeadTemperature;
  breakdown: { questionKey: string; answerKey: string; points: number }[];
};

export const weightKey = (questionKey: string, answerKey: string) => `${questionKey}:${answerKey}`;

export function temperatureFor(score: number): LeadTemperature {
  if (score >= HOT_THRESHOLD) return 'HOT';
  if (score >= WARM_THRESHOLD) return 'WARM';
  return 'COLD';
}

export function calculateScore(answers: AnswerInput[], weights: WeightLookup): ScoreResult {
  const breakdown = answers.map(({ questionKey, answerKey }) => ({
    questionKey,
    answerKey,
    // "Sem resposta" e respostas sem peso cadastrado (ex.: consentimento) valem 0.
    points: answerKey === NO_ANSWER_ID ? 0 : (weights.get(weightKey(questionKey, answerKey)) ?? 0),
  }));

  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  const score = Math.min(MAX_SCORE, Math.max(0, total));

  return { score, temperature: temperatureFor(score), breakdown };
}

export type WeightUpdate = { questionKey: string; answerKey: string; points: number };

/** Valida uma alteração de pesos feita pelo dono. Devolve a lista de erros (vazia = ok). */
export function validateWeightUpdates(updates: WeightUpdate[], allowedKeys: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  for (const update of updates) {
    const key = weightKey(update.questionKey, update.answerKey);
    if (!allowedKeys.has(key)) errors.push(`Resposta desconhecida: ${key}`);
    if (!Number.isInteger(update.points) || update.points < MIN_WEIGHT || update.points > MAX_WEIGHT) {
      errors.push(`Pontos de ${key} devem ser um número inteiro de ${MIN_WEIGHT} a ${MAX_WEIGHT}`);
    }
  }
  return errors;
}
