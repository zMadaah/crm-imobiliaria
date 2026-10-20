import { STAGE_LABEL } from '../lib/labels';
import { TEMPERATURE_LABEL, TEMPERATURE_TEXT } from '../lib/temperature';
import type { LeadDetail } from '../lib/types';
import { formatDateTime } from './formatDate';
import { LeadDeals } from './LeadDeals';
import { LeadVisits } from './LeadVisits';

export function LeadSidebar({ lead, onChanged }: { lead: LeadDetail; onChanged: () => void }) {
  const scored = lead.answers.filter((answer) => answer.questionKey !== 'greeting');
  const consent = lead.answers.find((answer) => answer.questionKey === 'greeting');

  return (
    <div className="space-y-8 px-4 py-5 md:px-6">
      <LeadDeals lead={lead} />
      <LeadVisits lead={lead} onChanged={onChanged} />

      <section aria-labelledby="score-title">
        <h2 id="score-title" className="font-semibold">
          Score
        </h2>
        {lead.temperature ? (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="tabular text-4xl font-bold tracking-tight">{lead.score}</span>
            <span className={`font-semibold ${TEMPERATURE_TEXT[lead.temperature]}`}>{TEMPERATURE_LABEL[lead.temperature]}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">O score é calculado quando o bot termina ou quando alguém assume a conversa.</p>
        )}

        {scored.length > 0 ? (
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">Respostas do cliente ao bot e pontos de cada uma</caption>
            <tbody className="divide-y divide-line">
              {scored.map((answer) => (
                <tr key={answer.questionKey}>
                  <th scope="row" className="py-2 pr-3 text-left align-top font-normal text-muted">
                    {answer.question}
                  </th>
                  <td className="py-2 pr-3 align-top">{answer.answer}</td>
                  <td className="tabular py-2 text-right align-top font-medium">{answer.points}</td>
                </tr>
              ))}
            </tbody>
            {lead.temperature && (
              <tfoot>
                <tr className="border-t-2 border-ink/20">
                  <th scope="row" colSpan={2} className="pt-2 text-left font-semibold">
                    Total
                  </th>
                  <td className="tabular pt-2 text-right font-semibold">{lead.score}</td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <p className="mt-3 text-sm text-muted">O cliente ainda não respondeu às perguntas do bot.</p>
        )}
        {consent && (
          <p className="mt-3 text-xs text-muted">
            Uso dos dados: {consent.answer === 'Sim, vamos lá' ? 'autorizado pelo cliente' : consent.answer.toLowerCase()}.
          </p>
        )}
      </section>

      <section aria-labelledby="history-title">
        <h2 id="history-title" className="font-semibold">
          Histórico de etapas
        </h2>
        <ol className="mt-3 space-y-3 border-l border-line pl-4">
          {lead.stageHistory.map((item, index) => (
            <li key={index} className="relative">
              <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-pine" aria-hidden />
              <p className="text-sm font-medium">{STAGE_LABEL[item.toStage]}</p>
              <p className="text-xs text-muted">
                {formatDateTime(item.changedAt)}
                {item.changedBy ? `, por ${item.changedBy}` : ', automático'}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
