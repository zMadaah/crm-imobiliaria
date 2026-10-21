import { RotateCcw, SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../lib/api';

type ChatItem = { from: 'bot' | 'client'; text: string; at: string };
type InputSpec =
  | { kind: 'options'; options: { id: string; title: string }[] }
  | { kind: 'text'; field: 'name' | 'phone'; placeholder: string }
  | { kind: 'done' };
type View = { company: string; messages: ChatItem[]; input: InputSpec };

const TOKEN_KEY = 'cb.atendimento.token';
const storage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* navegador sem armazenamento: o atendimento funciona, só não continua depois */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* idem */
    }
  },
};

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Página pública de atendimento. O anúncio aponta para /atendimento?anuncio=REF-101.
 * O cliente conversa com o bot sem WhatsApp; o corretor chama depois pelo painel.
 */
export function Attendance() {
  const [params] = useSearchParams();
  const adCode = params.get('anuncio');
  const [company, setCompany] = useState('CB Engenharia');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState<InputSpec | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<void>) | null>(null);
  const tokenRef = useRef<string | null>(storage.get());
  const honeypot = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const started = useRef(false);

  /** Mostra as falas do bot uma a uma, como numa conversa. */
  const reveal = useCallback(async (view: View, alreadyShown = 0) => {
    setCompany(view.company);
    const fresh = view.messages.slice(alreadyShown);
    const clientFirst = fresh[0]?.from === 'client' ? [fresh[0]] : [];
    if (clientFirst.length) setItems((current) => [...current, ...clientFirst]);
    for (const item of fresh.slice(clientFirst.length)) {
      if (!reducedMotion()) {
        setTyping(true);
        await wait(Math.min(1200, 350 + item.text.length * 6));
        setTyping(false);
      }
      setItems((current) => [...current, item]);
    }
    setInput(view.input);
  }, []);

  /** Executa uma ação; se falhar, mostra o erro e o que fazer ao tocar em "Tentar de novo". */
  const run = useCallback(async (action: () => Promise<void>, onRetry?: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setTyping(false);
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Confira sua internet.');
      const retry = onRetry ?? action;
      setLastAction(() => () => run(retry));
    }
  }, []);

  /** Recarrega a conversa do servidor (resposta pode ter chegado mesmo com erro de rede). */
  const resync = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const view = await apiFetch<View>('/public/chat/resume', { method: 'POST', body: JSON.stringify({ token }) });
    setCompany(view.company);
    setItems(view.messages);
    setInput(view.input);
  }, []);

  const startNew = useCallback(async () => {
    const view = await apiFetch<View & { token: string }>('/public/chat/start', {
      method: 'POST',
      body: JSON.stringify({ anuncio: adCode, website: honeypot.current?.value ?? '' }),
    });
    tokenRef.current = view.token;
    storage.set(view.token);
    await reveal(view);
  }, [adCode, reveal]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(async () => {
      const token = tokenRef.current;
      if (token) {
        try {
          const view = await apiFetch<View>('/public/chat/resume', { method: 'POST', body: JSON.stringify({ token }) });
          setCompany(view.company);
          setItems(view.messages);
          setInput(view.input);
          return;
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 404)) throw err;
          storage.clear();
        }
      }
      await startNew();
    });
  }, [run, startNew]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.parentElement?.scrollTo({ top: log.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [items, typing, input]);

  async function send(body: { reply: string } | { text: string }) {
    const token = tokenRef.current;
    if (!token) return;
    setInput(null);
    setTyping(true);
    await run(async () => {
      // A resposta já traz a fala do cliente seguida das falas do bot.
      const view = await apiFetch<View>('/public/chat/answer', { method: 'POST', body: JSON.stringify({ token, ...body }) });
      setTyping(false);
      await reveal(view);
    }, resync);
  }

  function restart() {
    storage.clear();
    tokenRef.current = null;
    setItems([]);
    setInput(null);
    void run(startNew);
  }

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <div className="grid size-10 place-items-center rounded-full bg-pine text-sm font-bold text-white" aria-hidden>
            CB
          </div>
          <div>
            <p className="font-semibold leading-tight">{company}</p>
            <p className="text-sm text-muted">{typing ? 'digitando…' : 'Atendimento online'}</p>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <ol ref={logRef} className="mx-auto max-w-xl space-y-2 px-4 py-5" aria-live="polite" aria-label="Conversa">
          {items.map((item, index) => (
            <li key={index} className={`flex ${item.from === 'client' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 leading-relaxed ${
                  item.from === 'client' ? 'rounded-br-md bg-pine text-white' : 'rounded-bl-md border border-line bg-surface'
                }`}
              >
                <span className="sr-only">{item.from === 'client' ? 'Você: ' : `${company}: `}</span>
                {item.text}
              </p>
            </li>
          ))}
          {typing && (
            <li className="flex justify-start" aria-hidden>
              <span className="flex gap-1 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${dot * 150}ms` }} />
                ))}
              </span>
            </li>
          )}
        </ol>
      </main>

      <footer className="shrink-0 border-t border-line bg-surface">
        <div className="mx-auto max-w-xl px-4 py-3">
          {/* Campo escondido contra robôs: pessoas não veem nem preenchem */}
          <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] size-px opacity-0" />

          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
              <p className="flex-1 text-danger">{error}</p>
              {lastAction && (
                <button type="button" onClick={() => void lastAction()} className="rounded-full border border-line px-3 py-1.5 hover:border-ink/40">
                  Tentar de novo
                </button>
              )}
            </div>
          ) : input?.kind === 'options' ? (
            <div className="flex flex-col gap-2" role="group" aria-label="Escolha uma opção">
              {input.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void send({ reply: option.id })}
                  className="rounded-xl border border-pine/40 bg-surface px-4 py-2.5 text-left text-pine-dark hover:bg-pine-soft"
                >
                  <span className="block font-semibold">{option.title}</span>
                </button>
              ))}
            </div>
          ) : input?.kind === 'text' ? (
            <TextAnswer key={input.field} spec={input} onSend={(text) => void send({ text })} />
          ) : input?.kind === 'done' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">Atendimento concluído.</p>
              <button type="button" onClick={restart} className="flex items-center gap-1.5 text-pine hover:underline">
                <RotateCcw size={15} aria-hidden /> Começar de novo
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">&nbsp;</p>
          )}
          <p className="mt-2 text-center text-xs text-muted">Seus dados são usados só para este atendimento.</p>
        </div>
      </footer>
    </div>
  );
}

function TextAnswer({ spec, onSend }: { spec: Extract<InputSpec, { kind: 'text' }>; onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const phone = spec.field === 'phone';

  useEffect(() => ref.current?.focus(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (text) onSend(text);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label htmlFor="chat-answer" className="sr-only">
        {phone ? 'Seu WhatsApp com DDD' : 'Seu nome'}
      </label>
      <input
        id="chat-answer"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={spec.placeholder}
        type={phone ? 'tel' : 'text'}
        inputMode={phone ? 'tel' : 'text'}
        autoComplete={phone ? 'tel-national' : 'name'}
        maxLength={phone ? 20 : 60}
        className="min-h-11 flex-1 rounded-full border border-line bg-paper px-4 outline-none focus:border-pine focus:bg-surface"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Enviar"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-pine text-white hover:bg-pine-dark disabled:opacity-40"
      >
        <SendHorizontal size={19} aria-hidden />
      </button>
    </form>
  );
}
