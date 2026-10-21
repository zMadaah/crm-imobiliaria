import { CheckCircle2, Copy, MessageCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

type Settings = {
  number: string | null;
  numberFormatted: string | null;
  waLink: string | null;
  status: { mode: string; phoneNumberConfigured: boolean; ready: boolean; problems: string[] };
};

/** Número do bot e se a ligação com a Meta está completa (só o dono vê). */
export function WhatsAppCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<Settings>('/settings/whatsapp').then(setSettings).catch(() => setSettings(null));
  }, []);

  if (!settings) return null;
  const { status } = settings;
  const testing = status.mode !== 'real';

  async function copy() {
    if (!settings?.waLink) return;
    try {
      await navigator.clipboard.writeText(settings.waLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* navegador sem permissão de copiar: o link continua visível na tela */
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MessageCircle size={20} className="text-pine" aria-hidden />
        <p className="font-semibold">
          {settings.numberFormatted ? `WhatsApp do bot: ${settings.numberFormatted}` : 'Número do WhatsApp não configurado'}
        </p>
        {status.ready && !testing ? (
          <span className="flex items-center gap-1 rounded-full bg-pine-soft px-2 py-0.5 text-xs font-semibold text-pine-dark">
            <CheckCircle2 size={13} aria-hidden /> Conectado à Meta
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-warm-soft px-2 py-0.5 text-xs font-semibold text-warm">
            <TriangleAlert size={13} aria-hidden /> {testing ? 'Modo de teste' : 'Configuração incompleta'}
          </span>
        )}
      </div>

      {settings.waLink && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-paper px-2 py-1">{settings.waLink}</code>
          <button type="button" onClick={() => void copy()} className="flex items-center gap-1 text-pine hover:underline">
            <Copy size={14} aria-hidden /> {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      )}

      <p className="mt-2 text-sm text-muted">
        {!settings.number
          ? 'Peça para configurarem WHATSAPP_BUSINESS_NUMBER no servidor.'
          : testing
            ? 'O bot está no modo de teste: as mensagens não são enviadas pela Meta. Para atender clientes de verdade, o número precisa ser cadastrado na Meta e o modo de teste desligado no servidor.'
            : status.ready
              ? 'Clientes que escreverem para este número são atendidos pelo bot.'
              : `Falta no servidor: ${status.problems.join('; ')}.`}
      </p>
    </div>
  );
}
