import { Bot } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import type { Message } from '../lib/types';
import { dayLabel, formatTime, isSameDay } from './formatDate';
import { MediaAttachment } from './MediaAttachment';

type Props = {
  messages: Message[];
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  currentUserId: string;
};

/**
 * Conversa do lead. Cliente à esquerda; bot e equipe à direita, com quem enviou.
 */
export function Conversation({ messages, hasMore, loadingOlder, onLoadOlder, currentUserId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  const firstId = messages[0]?.id;
  const previousHeight = useRef(0);
  const previousFirstId = useRef<string | undefined>(undefined);
  const initialScrollDone = useRef(false);

  // Ao abrir: vai para a última mensagem. Depois: rola só se a pessoa já estava perto do fim.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (messages.length === 0) {
      initialScrollDone.current = false;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (!initialScrollDone.current || nearBottom) el.scrollTop = el.scrollHeight;
    initialScrollDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // Mensagens antigas carregadas no topo: mantém a posição de leitura.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (previousFirstId.current && firstId !== previousFirstId.current) {
      el.scrollTop += el.scrollHeight - previousHeight.current;
    }
    previousFirstId.current = firstId;
    previousHeight.current = el.scrollHeight;
  }, [firstId, messages.length]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6" aria-live="polite" aria-relevant="additions">
      {hasMore && (
        <div className="mb-4 text-center">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            {loadingOlder ? 'Carregando…' : 'Ver mensagens anteriores'}
          </button>
        </div>
      )}

      {messages.length === 0 && <p className="text-center text-sm text-muted">Nenhuma mensagem ainda.</p>}

      <ol className="space-y-1.5">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || !isSameDay(new Date(previous.sentAt), new Date(message.sentAt));
          const sameSender =
            previous && !newDay && previous.direction === message.direction && previous.sentBy?.id === message.sentBy?.id;
          return (
            <Fragment key={message.id}>
              {newDay && (
                <li className="py-3 text-center text-xs font-medium text-muted" aria-hidden>
                  {dayLabel(message.sentAt)}
                </li>
              )}
              <MessageBubble message={message} showSender={!sameSender} currentUserId={currentUserId} />
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

function MessageBubble({ message, showSender, currentUserId }: { message: Message; showSender: boolean; currentUserId: string }) {
  const inbound = message.direction === 'INBOUND';
  const fromBot = !inbound && !message.sentBy;
  const fromMe = message.sentBy?.id === currentUserId;

  const sender = inbound ? null : fromBot ? 'Bot' : fromMe ? 'Você' : message.sentBy!.name;
  const bubble = inbound
    ? 'bg-surface border border-line'
    : fromBot
      ? 'bg-pine-soft text-ink'
      : 'bg-pine text-white';

  return (
    <li className={`flex flex-col ${inbound ? 'items-start' : 'items-end'} ${showSender ? 'pt-2' : ''}`}>
      {showSender && sender && (
        <span className="mb-0.5 flex items-center gap-1 px-1 text-xs text-muted">
          {fromBot && <Bot size={13} aria-hidden />}
          {sender}
        </span>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 md:max-w-[70%] ${bubble}`}>
        {message.hasMedia && (
          <div className="mb-1">
            <MediaAttachment message={message} />
          </div>
        )}
        {message.body && message.type !== 'document' && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
        )}
        {!message.body && !message.hasMedia && <p className="text-sm italic opacity-70">Tipo de mensagem não suportado</p>}
        <p className={`tabular mt-0.5 text-right text-[0.7rem] ${inbound || fromBot ? 'text-muted' : 'text-white/75'}`}>
          <span className="sr-only">{sender ? `${sender}, ` : 'Cliente, '}</span>
          {formatTime(message.sentAt)}
        </p>
      </div>
    </li>
  );
}
