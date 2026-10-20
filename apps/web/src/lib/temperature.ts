import type { Temperature } from './types';

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  HOT: 'Quente',
  WARM: 'Morno',
  COLD: 'Frio',
};

export const TEMPERATURE_TEXT: Record<Temperature, string> = {
  HOT: 'text-hot',
  WARM: 'text-warm',
  COLD: 'text-cold',
};

export function temperatureFor(score: number, thresholds: { hot: number; warm: number }): Temperature {
  if (score >= thresholds.hot) return 'HOT';
  if (score >= thresholds.warm) return 'WARM';
  return 'COLD';
}
