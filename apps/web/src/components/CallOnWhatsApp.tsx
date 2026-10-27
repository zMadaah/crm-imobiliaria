import { MessageCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { LeadDetail } from '../lib/types';

/**
 * Lead que veio pela página de atendimento: a conversa continua no WhatsApp de quem
 * está no painel. Abre a conversa com o cliente já com uma mensagem pronta.
 */
export function CallOnWhatsApp({ lead }: { lead: LeadDetail }) {
  const { user } = useAuth();
  const clientName = lead.name?.trim().split(/\s+/)[0];
  const myName = user?.name.trim().split(/\s+/)[0] ?? '';
  const property = lead.propertyReference ? ` (${lead.propertyReference})` : '';
  const message =
    `Olá${clientName ? `, ${clientName}` : ''}! Aqui é ${myName}, da CB Engenharia. ` +
    `Recebi suas respostas no nosso atendimento online e vi seu interesse no empreendimento${property}. ` +
    'Posso te ajudar com mais informações?';
  const link = `https://wa.me/${lead.phone}?text=${encodeURIComponent(message)}`;

  return (
    <div className="border-t border-line bg-surface px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full bg-pine px-4 py-2.5 text-sm font-semibold text-white hover:bg-pine-dark"
        >
          <MessageCircle size={18} aria-hidden />
          Chamar no WhatsApp
        </a>
        <p className="min-w-0 flex-1 text-sm text-muted">
          Este cliente veio pela página de atendimento. A conversa continua no seu WhatsApp, com uma mensagem pronta para
          você revisar antes de enviar.
        </p>
      </div>
    </div>
  );
}
