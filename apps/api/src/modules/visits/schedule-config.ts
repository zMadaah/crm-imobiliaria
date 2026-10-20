/**
 * Expediente usado pelo bot para oferecer horários de visita.
 * Visitas criadas à mão no painel podem ficar fora dele.
 */
export type OpeningHours = { open: number; close: number } | null; // horas cheias, horário local

export type ScheduleConfig = {
  timeZone: string;
  visitMinutes: number;
  slotStepMinutes: number;
  minNoticeMinutes: number;
  daysAhead: number; // dias COM expediente
  maxSlotsPerDay: number;
  maxSlots: number;
  /** Índice = dia da semana (0 = domingo) */
  hours: OpeningHours[];
};

export const SCHEDULE: ScheduleConfig = {
  timeZone: 'America/Sao_Paulo',
  visitMinutes: 60,
  slotStepMinutes: 60,
  minNoticeMinutes: 180,
  daysAhead: 5,
  maxSlotsPerDay: 2,
  maxSlots: 8,
  hours: [
    null, // domingo
    { open: 9, close: 18 },
    { open: 9, close: 18 },
    { open: 9, close: 18 },
    { open: 9, close: 18 },
    { open: 9, close: 18 },
    { open: 9, close: 13 }, // sábado
  ],
};
