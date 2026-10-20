import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, formatDayMonth, formatFullDay, formatWeekday } from '../lib/dates';
import { displayName, VISIT_STATUS_LABEL } from '../lib/labels';
import type { Visit } from '../lib/types';
import { formatTime, isSameDay } from './formatDate';
import { visitTone } from './visitStyle';

const FIRST_HOUR = 7;
const LAST_HOUR = 21;
const HOUR_PX = 56;

type Props = {
  weekStart: Date;
  visits: Visit[];
  onSelectVisit: (visit: Visit) => void;
  onSelectSlot: (start: Date) => void;
};

export function WeekCalendar({ weekStart, visits, onSelectVisit, onSelectSlot }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const now = useNow();

  return (
    <>
      {/* Computador: grade da semana */}
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface md:block">
        <div className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-line" />
          {days.map((day) => {
            const today = isSameDay(day, now);
            return (
              <div key={day.toISOString()} className="border-b border-l border-line px-2 py-2 text-center">
                <p className={`text-sm ${today ? 'font-semibold text-pine' : 'text-muted'}`}>{formatWeekday(day)}</p>
                <p className={`tabular text-lg font-semibold ${today ? 'text-pine' : ''}`}>{formatDayMonth(day)}</p>
              </div>
            );
          })}

          <div className="relative" style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR_PX }}>
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
              <span key={i} className="tabular absolute right-2 -translate-y-1/2 text-xs text-muted" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : `${FIRST_HOUR + i}h`}
              </span>
            ))}
          </div>

          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              now={now}
              visits={visits.filter((v) => isSameDay(new Date(v.scheduledAt), day))}
              onSelectVisit={onSelectVisit}
              onSelectSlot={onSelectSlot}
            />
          ))}
        </div>
      </div>

      {/* Celular: lista por dia */}
      <ol className="space-y-5 md:hidden">
        {days.map((day) => {
          const dayVisits = visits.filter((v) => isSameDay(new Date(v.scheduledAt), day));
          return (
            <li key={day.toISOString()}>
              <h3 className={`text-sm font-semibold ${isSameDay(day, now) ? 'text-pine' : 'text-muted'}`}>{formatFullDay(day)}</h3>
              {dayVisits.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Sem visitas.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {dayVisits.map((visit) => (
                    <li key={visit.id}>
                      <VisitCard visit={visit} onClick={() => onSelectVisit(visit)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function DayColumn({
  day,
  now,
  visits,
  onSelectVisit,
  onSelectSlot,
}: {
  day: Date;
  now: Date;
  visits: Visit[];
  onSelectVisit: (visit: Visit) => void;
  onSelectSlot: (start: Date) => void;
}) {
  const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
  const top = (date: Date) => ((minutesOf(date) - FIRST_HOUR * 60) / 60) * HOUR_PX;
  const showNow = isSameDay(day, now) && now.getHours() >= FIRST_HOUR && now.getHours() < LAST_HOUR;

  return (
    <div className="relative border-l border-line" style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR_PX }}>
      {/* Faixas de hora clicáveis: agendar naquele horário */}
      {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => {
        const start = new Date(day);
        start.setHours(FIRST_HOUR + i, 0, 0, 0);
        const past = start.getTime() < now.getTime();
        return (
          <button
            key={i}
            type="button"
            disabled={past}
            onClick={() => onSelectSlot(start)}
            aria-label={`Agendar visita em ${formatFullDay(start)} às ${FIRST_HOUR + i}h`}
            className={`absolute inset-x-0 border-t border-line/70 ${past ? 'cursor-default bg-paper/40' : 'hover:bg-pine-soft/50'}`}
            style={{ top: i * HOUR_PX, height: HOUR_PX }}
          />
        );
      })}

      {visits.map((visit) => {
        const start = new Date(visit.scheduledAt);
        const end = new Date(visit.endsAt);
        const y = Math.max(0, top(start));
        const height = Math.max(24, Math.min(top(end), (LAST_HOUR - FIRST_HOUR) * HOUR_PX) - y - 2);
        return (
          <button
            key={visit.id}
            type="button"
            onClick={() => onSelectVisit(visit)}
            className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs ${visitTone(visit)}`}
            style={{ top: y + 1, height }}
          >
            <span className="flex items-center gap-1 font-semibold">
              {visit.pending && <AlertCircle size={12} className="shrink-0 text-hot" aria-label="Aguardando registro" />}
              <span className="truncate">{visit.lead ? displayName(visit.lead) : 'Visita'}</span>
            </span>
            <span className="tabular block truncate">
              {formatTime(visit.scheduledAt)} às {formatTime(visit.endsAt)}
            </span>
          </button>
        );
      })}

      {showNow && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-hot" style={{ top: top(now) }} aria-hidden>
          <span className="absolute -left-1 -top-1 size-2 rounded-full bg-hot" />
        </div>
      )}
    </div>
  );
}

/** Cartão da visita. Na tela do lead, o título é a data (o lead já está na tela). */
export function VisitCard({ visit, onClick, titleBy = 'lead' }: { visit: Visit; onClick: () => void; titleBy?: 'lead' | 'date' }) {
  const title =
    titleBy === 'date' || !visit.lead
      ? `${formatWeekday(new Date(visit.scheduledAt))}, ${formatDayMonth(new Date(visit.scheduledAt))}`
      : displayName(visit.lead);
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-md border-l-4 px-3 py-2 text-left ${visitTone(visit)}`}>
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold capitalize-first">{title}</span>
        <span className="tabular text-sm">
          {formatTime(visit.scheduledAt)} às {formatTime(visit.endsAt)}
        </span>
      </span>
      <span className="block text-sm">
        {visit.pending ? (
          <span className="font-medium text-hot">Aguardando registro</span>
        ) : (
          VISIT_STATUS_LABEL[visit.status]
        )}
        {visit.propertyReference && <span className="text-muted">. Imóvel {visit.propertyReference}</span>}
      </span>
    </button>
  );
}

/** Hora atual, atualizada a cada minuto (linha do "agora" e pendências). */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
