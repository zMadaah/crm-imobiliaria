import { formatMoney } from '../lib/labels';
import type { LeadDetail } from '../lib/types';
import { formatDateTime } from './formatDate';

export function LeadDeals({ lead }: { lead: LeadDetail }) {
  if (lead.deals.length === 0) return null;
  return (
    <section aria-labelledby="deals-title">
      <h2 id="deals-title" className="font-semibold">
        {lead.deals.length > 1 ? 'Negócios' : 'Negócio'}
      </h2>
      <ul className="mt-3 space-y-2">
        {lead.deals.map((deal) => {
          const won = deal.result === 'WON';
          return (
            <li
              key={deal.id}
              className={`rounded-md border-l-4 px-3 py-2 text-sm ${
                deal.voidedAt ? 'border-line bg-paper text-muted' : won ? 'border-pine bg-pine-soft' : 'border-muted/50 bg-paper'
              }`}
            >
              <p className={`font-semibold ${deal.voidedAt ? 'line-through' : ''}`}>
                {won
                  ? `${deal.kind === 'SALE' ? 'Vendido' : 'Alugado'} por ${formatMoney(deal.value ?? 0)}${deal.kind === 'RENT' ? ' ao mês' : ''}`
                  : `Perdido: ${deal.lossReasonLabel}`}
              </p>
              {deal.propertyReference && <p>Imóvel: {deal.propertyReference}</p>}
              {deal.notes && <p>{deal.notes}</p>}
              <p className="text-xs text-muted">
                {formatDateTime(deal.closedAt)}
                {deal.closedBy ? `, por ${deal.closedBy}` : ''}
                {deal.voidedAt ? `. Anulado em ${formatDateTime(deal.voidedAt)}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
