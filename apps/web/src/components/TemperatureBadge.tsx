import { TEMPERATURE_LABEL } from '../lib/temperature';
import type { Temperature } from '../lib/types';

const STYLE: Record<Temperature, string> = {
  HOT: 'bg-hot-soft text-hot',
  WARM: 'bg-warm-soft text-warm',
  COLD: 'bg-cold-soft text-cold',
};

export function TemperatureBadge({ temperature, score }: { temperature: Temperature | null; score?: number }) {
  if (!temperature) {
    return <span className="inline-flex rounded-full bg-paper px-2.5 py-0.5 text-sm text-muted">Sem nota</span>;
  }
  return (
    <span className={`tabular inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold ${STYLE[temperature]}`}>
      {TEMPERATURE_LABEL[temperature]}
      {score !== undefined && <span className="font-normal opacity-80">{score}</span>}
    </span>
  );
}
