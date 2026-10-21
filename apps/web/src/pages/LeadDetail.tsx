import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CallOnWhatsApp } from '../components/CallOnWhatsApp';
import { Composer } from '../components/Composer';
import { DealActions } from '../components/DealActions';
import { Conversation } from '../components/Conversation';
import { LeadSidebar } from '../components/LeadSidebar';
import { useRealtimeEvent } from '../components/NotificationsProvider';
import { TemperatureBadge } from '../components/TemperatureBadge';
import { ApiError, apiFetch } from '../lib/api';
import { BOT_STATUS_LABEL, displayName, formatPhone, originLabel, STAGE_LABEL } from '../lib/labels';
import type { LeadDetail as LeadDetailData, Message } from '../lib/types';

type MessagesPage = { items: Message[]; hasMore: boolean };

export function LeadDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [lead, setLead] = useState<LeadDetailData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'conversa' | 'detalhes'>('conversa');

  const loadLead = useCallback(async () => {
    try {
      setLead(await apiFetch<LeadDetailData>(`/leads/${id}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o lead.');
    }
  }, [id]);

  const markRead = useCallback(() => apiFetch(`/leads/${id}/read`, { method: 'POST' }).catch(() => undefined), [id]);

  useEffect(() => {
    setLead(null);
    setMessages([]);
    setNotFound(false);
    void loadLead();
    apiFetch<MessagesPage>(`/leads/${id}/messages`)
      .then((page) => {
        setMessages(page.items);
        setHasMore(page.hasMore);
        void markRead();
      })
      .catch(() => undefined);
  }, [id, loadLead, markRead]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await apiFetch<MessagesPage>(`/leads/${id}/messages?before=${encodeURIComponent(oldest.sentAt)}`);
      setMessages((current) => [...page.items, ...current]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  const appendMessage = useCallback((message: Message) => {
    setMessages((current) =>
      current.some((m) => m.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    );
  }, []);

  // Mensagem nova deste lead: entra na conversa e atualiza etapa, score e janela.
  const detailTimer = useRef<number | undefined>(undefined);
  useRealtimeEvent<Message>('message', (message) => {
    if (message.leadId !== id) return;
    appendMessage(message);
    if (message.direction === 'INBOUND') void markRead();
    window.clearTimeout(detailTimer.current);
    detailTimer.current = window.setTimeout(() => void loadLead(), 500);
  });

  // Visita criada ou registrada em outra tela: atualiza etapa e lista de visitas.
  useRealtimeEvent('visit', () => void loadLead());

  async function send(body: string) {
    try {
      const message = await apiFetch<Message>(`/leads/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      appendMessage(message);
      void loadLead();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) void loadLead();
      throw err;
    }
  }

  if (notFound) {
    return (
      <section className="max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Lead não encontrado</h1>
        <p className="mt-2 text-muted">Ele não existe ou não está atribuído a você.</p>
        <Link to="/leads" className="mt-4 inline-block text-pine hover:underline">
          Voltar para os leads
        </Link>
      </section>
    );
  }
  if (error) return <p className="text-danger">{error}</p>;
  if (!lead || !user) return <p className="text-muted">Carregando lead…</p>;

  const tabClass = (value: typeof tab) =>
    `flex-1 border-b-2 py-2.5 text-sm font-medium ${tab === value ? 'border-pine text-ink' : 'border-transparent text-muted'}`;

  return (
    <section className="-mx-5 -mb-16 flex h-[calc(100%+4rem)] flex-col md:-mx-10">
      <header className="border-b border-line bg-surface px-4 py-3 md:px-6">
        <div className="flex items-start gap-3">
          <Link to="/leads" aria-label="Voltar para os leads" className="mt-1 text-muted hover:text-ink">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-xl font-bold tracking-tight">{displayName(lead)}</h1>
              <TemperatureBadge temperature={lead.temperature} score={lead.temperature ? lead.score : undefined} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {lead.name && <>{formatPhone(lead.phone)}. </>}
              {STAGE_LABEL[lead.stage]}
              {lead.broker ? `, com ${lead.broker.name}` : ', sem corretor'}. {originLabel(lead)}.
              {lead.channel === 'SITE' ? <> Veio pela página de atendimento.</> : lead.botStatus && <> {BOT_STATUS_LABEL[lead.botStatus]}.</>}
            </p>
          </div>
          <div className="hidden md:block">
            <DealActions lead={lead} onChanged={() => void loadLead()} />
          </div>
        </div>
        <div className="mt-3 md:hidden">
          <DealActions lead={lead} onChanged={() => void loadLead()} />
        </div>
      </header>

      <div role="tablist" aria-label="Seções do lead" className="flex border-b border-line bg-surface lg:hidden">
        <button type="button" role="tab" aria-selected={tab === 'conversa'} onClick={() => setTab('conversa')} className={tabClass('conversa')}>
          Conversa
        </button>
        <button type="button" role="tab" aria-selected={tab === 'detalhes'} onClick={() => setTab('detalhes')} className={tabClass('detalhes')}>
          Visitas e respostas
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`min-h-0 flex-1 flex-col ${tab === 'conversa' ? 'flex' : 'hidden'} lg:flex`}>
          <Conversation
            messages={messages}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={() => void loadOlder()}
            currentUserId={user.id}
          />
          {lead.channel === 'SITE' ? (
            <CallOnWhatsApp lead={lead} />
          ) : (
            <Composer window={lead.serviceWindow} botActive={lead.botStatus === 'ACTIVE'} onSend={send} />
          )}
        </div>
        <aside
          aria-label="Visitas, respostas do bot e histórico"
          className={`min-h-0 w-full overflow-y-auto border-line bg-surface lg:block lg:w-[22rem] lg:border-l ${tab === 'detalhes' ? 'block' : 'hidden'}`}
        >
          <LeadSidebar lead={lead} onChanged={() => void loadLead()} />
        </aside>
      </div>
    </section>
  );
}
