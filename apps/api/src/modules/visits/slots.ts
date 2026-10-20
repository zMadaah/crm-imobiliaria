import type { ScheduleConfig } from './schedule-config';
import { addLocalDays, fromLocalParts, toLocalParts } from './zoned-time';
import { overlaps, type TimeRange } from './visit-rules';

export type Slot = { start: Date; end: Date };

/**
 * Horários livres de um corretor dentro do expediente. Função pura.
 * Espalha as opções: até maxSlotsPerDay por dia, priorizando uma de manhã e uma à tarde.
 */
export function generateFreeSlots(params: { now: Date; busy: TimeRange[]; config: ScheduleConfig }): Slot[] {
  const { now, busy, config } = params;
  const earliest = now.getTime() + config.minNoticeMinutes * 60_000;
  const today = toLocalParts(now, config.timeZone);
  const result: Slot[] = [];

  let workingDays = 0;
  // Limite de segurança: não varre mais que 30 dias procurando dias com expediente.
  for (let offset = 0; offset < 30 && workingDays < config.daysAhead; offset++) {
    const day = addLocalDays(today, offset);
    const hours = config.hours[day.weekday];
    if (!hours) continue;
    workingDays++;

    const candidates: Slot[] = [];
    for (let minutes = hours.open * 60; minutes + config.visitMinutes <= hours.close * 60; minutes += config.slotStepMinutes) {
      const start = fromLocalParts({ ...day, hour: Math.floor(minutes / 60), minute: minutes % 60 }, config.timeZone);
      const end = new Date(start.getTime() + config.visitMinutes * 60_000);
      if (start.getTime() < earliest) continue;
      if (busy.some((range) => overlaps({ start, end }, range))) continue;
      candidates.push({ start, end });
    }

    for (const slot of pickSpread(candidates, config)) {
      if (result.length >= config.maxSlots) return result;
      result.push(slot);
    }
  }
  return result;
}

function pickSpread(candidates: Slot[], config: ScheduleConfig): Slot[] {
  const hourOf = (slot: Slot) => toLocalParts(slot.start, config.timeZone).hour;
  const picked: Slot[] = [];
  const morning = candidates.find((slot) => hourOf(slot) < 12);
  const afternoon = candidates.find((slot) => hourOf(slot) >= 14) ?? candidates.find((slot) => hourOf(slot) >= 12);
  for (const slot of [morning, afternoon]) {
    if (slot && !picked.includes(slot) && picked.length < config.maxSlotsPerDay) picked.push(slot);
  }
  for (const slot of candidates) {
    if (picked.length >= config.maxSlotsPerDay) break;
    if (!picked.includes(slot)) picked.push(slot);
  }
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}
