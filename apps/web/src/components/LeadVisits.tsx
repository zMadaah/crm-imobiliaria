import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import type { LeadDetail, Visit } from '../lib/types';
import { VisitCard } from './WeekCalendar';
import { VisitDialog } from './VisitDialog';
import { VisitForm } from './VisitForm';

export function LeadVisits({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Visit | null>(null);
  const visits = lead.visits.map((visit) => ({ ...visit, lead: { id: lead.id, name: lead.name, phone: lead.phone } }));

  function done() {
    setCreating(false);
    setSelected(null);
    onChanged();
    window.dispatchEvent(new Event('crm:visits-changed'));
  }

  return (
    <section aria-labelledby="visits-title">
      <div className="flex items-center justify-between">
        <h2 id="visits-title" className="font-semibold">
          Visitas
        </h2>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 text-sm text-pine hover:underline">
          <CalendarPlus size={16} aria-hidden />
          Agendar visita
        </button>
      </div>

      {visits.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nenhuma visita ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visits.map((visit) => (
            <li key={visit.id}>
              <VisitCard visit={visit} titleBy="date" onClick={() => setSelected(visit)} />
            </li>
          ))}
        </ul>
      )}

      {creating && <VisitForm presetLeadId={lead.id} onClose={() => setCreating(false)} onCreated={done} />}
      {selected && <VisitDialog visit={selected} onClose={() => setSelected(null)} onSaved={done} />}
    </section>
  );
}
