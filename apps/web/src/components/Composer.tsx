import { Clock, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { LeadDetail } from '../lib/types';
import { formatDateTime, formatTime, isSameDay } from './formatDate';

type Props = {
  window: LeadDetail['serviceWindow'];
  botActive: boolean;
  onSend: (body: string) => Promise<void>;
};

const MAX_LENGTH = 4096;

export function Composer({ window: serviceWindow, botActive, onSend }: Props) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cresce com o texto, até um limite.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  if (!serviceWindow.open) {
    return (
      <div className="border-t border-line bg-paper px-4 py-3 text-sm text-muted md:px-6">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Clock size={16} aria-hidden />
          Não dá para responder agora
        </p>
        <p className="mt-0.5">
          {serviceWindow.closesAt
            ? 'Já se passaram 24 horas desde a última mensagem do cliente. Pela regra do WhatsApp, ele precisa escrever de novo para você poder responder.'
            : 'O cliente ainda não mandou nenhuma mensagem.'}
        </p>
      </div>
    );
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setBody('');
      textareaRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  const closesAt = serviceWindow.closesAt!;
  const closesLabel = isSameDay(new Date(closesAt), new Date()) ? `hoje às ${formatTime(closesAt)}` : formatDateTime(closesAt);

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface px-4 py-3 md:px-6">
      {botActive && (
        <p className="mb-2 text-sm text-warm">O bot ainda está conversando. Ao enviar, ele para e você assume o atendimento.</p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Mensagem para o cliente
        </label>
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          maxLength={MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escreva uma mensagem"
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 leading-snug outline-none focus:border-pine focus:bg-surface"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          aria-label="Enviar mensagem"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-pine text-white hover:bg-pine-dark disabled:opacity-40"
        >
          <SendHorizontal size={19} aria-hidden />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted" role={error ? 'alert' : undefined}>
        {error ? <span className="text-danger">{error}</span> : <>Você pode responder até {closesLabel}. Enter envia, Shift+Enter quebra a linha.</>}
      </p>
    </form>
  );
}
