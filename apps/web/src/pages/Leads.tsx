import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { formatListTime } from '../components/formatDate';
import { useRealtimeEvent } from '../components/NotificationsProvider';
import { TemperatureBadge } from '../components/TemperatureBadge';
import { ApiError, apiFetch } from '../lib/api';
import { displayName, originLabel, STAGE_LABEL, STAGE_ORDER } from '../lib/labels';
import type { LeadListItem } from '../lib/types';

const TEMPERATURE_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'HOT', label: 'Quentes' },
  { value: 'WARM', label: 'Mornos' },
  { value: 'COLD', label: 'Frios' },
  { value: 'NONE', label: 'Sem nota' },
];

type Page = { items: LeadListItem[]; nextCursor: string | null };

export function Leads() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const temperature = params.get('temperatura') ?? '';
  const stage = params.get('etapa') ?? '';
  const query = params.get('busca') ?? '';

  const [search, setSearch] = useState(query);
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPath = useCallback(
    (cursor?: string) => {
      const qs = new URLSearchParams();
      if (temperature) qs.set('temperature', temperature);
      if (stage) qs.set('stage', stage);
      if (query) qs.set('q', query);
      if (cursor) qs.set('cursor', cursor);
      return `/leads?${qs.toString()}`;
    },
    [temperature, stage, query],
  );

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await apiFetch<Page>(buildPath());
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os leads.');
    } finally {
      setLoading(false);
    }
  }, [buildPath]);

  useEffect(() => {
    setLoading(true);
    void loadFirstPage();
  }, [loadFirstPage]);

  // Busca com pequena espera enquanto a pessoa digita.
  useEffect(() => {
    const timer = window.setTimeout(() => updateParam('busca', search.trim()), 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Mensagem nova em qualquer lead: recarrega a primeira página (agrupando rajadas).
  const refreshTimer = useRef<number | undefined>(undefined);
  useRealtimeEvent('message', () => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void loadFirstPage(), 600);
  });

  function updateParam(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await apiFetch<Page>(buildPath(nextCursor));
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  const isOwner = user?.role === 'OWNER';
  const hasFilters = Boolean(temperature || stage || query);

  return (
    <section className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
      <p className="mt-1 text-muted">
        {isOwner ? 'Todos os leads da imobiliária.' : 'Os leads atribuídos a você.'} Os mais recentes aparecem primeiro.
      </p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div role="group" aria-label="Temperatura" className="flex flex-wrap gap-1.5">
          {TEMPERATURE_FILTERS.map((filter) => {
            const active = temperature === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                aria-pressed={active}
                onClick={() => updateParam('temperatura', filter.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:border-ink/40'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 md:ml-auto">
          <label className="sr-only" htmlFor="stage-filter">
            Etapa
          </label>
          <select
            id="stage-filter"
            value={stage}
            onChange={(e) => updateParam('etapa', e.target.value)}
            className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm"
          >
            <option value="">Todas as etapas</option>
            {STAGE_ORDER.map((value) => (
              <option key={value} value={value}>
                {STAGE_LABEL[value]}
              </option>
            ))}
          </select>
          <div className="relative flex-1 md:w-60 md:flex-none">
            <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <label className="sr-only" htmlFor="lead-search">
              Buscar por nome ou telefone
            </label>
            <input
              id="lead-search"
              type="search"
              placeholder="Nome ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-line bg-surface py-2 pl-8 pr-2.5 text-sm outline-none focus:border-pine"
            />
          </div>
        </div>
      </div>

      {error && <p className="mt-6 text-danger">{error}</p>}

      {loading ? (
        <p className="mt-10 text-muted">Carregando leads…</p>
      ) : items.length === 0 ? (
        <p className="mt-10 max-w-md text-muted">
          {hasFilters
            ? 'Nenhum lead com esses filtros. Tente limpar a busca ou escolher outra temperatura.'
            : isOwner
              ? 'Ainda não chegou nenhum lead. Quando alguém mandar mensagem pelo WhatsApp, ele aparece aqui.'
              : 'Você ainda não tem leads. Eles chegam aqui assim que o bot terminar a qualificação e o rodízio escolher você.'}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line bg-surface">
          {items.map((lead) => (
            <li key={lead.id}>
              <Link
                to={`/leads/${lead.id}`}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-paper md:grid-cols-[minmax(0,14rem)_8rem_minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className={`truncate ${lead.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>{displayName(lead)}</p>
                  <p className="truncate text-sm text-muted">
                    {STAGE_LABEL[lead.stage]}
                    {isOwner && <>, {lead.broker ? `com ${lead.broker.name}` : 'sem corretor'}</>}
                  </p>
                </div>

                <div className="order-3 md:order-none md:self-center">
                  <TemperatureBadge temperature={lead.temperature} score={lead.temperature ? lead.score : undefined} />
                </div>

                <div className="order-4 col-span-2 min-w-0 md:order-none md:col-span-1 md:self-center">
                  <p className={`truncate text-sm ${lead.unreadCount > 0 ? 'text-ink' : 'text-muted'}`}>
                    {lead.lastMessage ? previewOf(lead.lastMessage) : 'Sem mensagens'}
                  </p>
                  <p className="truncate text-xs text-muted">{originLabel(lead)}</p>
                </div>

                <div className="flex flex-col items-end gap-1 md:self-center">
                  {lead.lastMessageAt && (
                    <span className={`tabular text-xs ${lead.unreadCount > 0 ? 'font-semibold text-pine' : 'text-muted'}`}>
                      {formatListTime(lead.lastMessageAt)}
                    </span>
                  )}
                  {lead.unreadCount > 0 && (
                    <span className="tabular grid min-w-5 place-items-center rounded-full bg-pine px-1.5 text-xs font-semibold leading-5 text-white">
                      <span className="sr-only">Não lidas: </span>
                      {lead.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 rounded-md border border-line bg-surface px-4 py-2 text-sm hover:border-ink/40 disabled:opacity-50"
        >
          {loadingMore ? 'Carregando…' : 'Carregar mais leads'}
        </button>
      )}
    </section>
  );
}

function previewOf(message: NonNullable<LeadListItem['lastMessage']>): string {
  const prefix = message.direction === 'OUTBOUND' ? 'Enviada: ' : '';
  if (message.body) return prefix + message.body.replace(/\s+/g, ' ');
  const kinds: Record<string, string> = { image: 'Foto', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha' };
  return prefix + (kinds[message.type] ?? 'Mensagem');
}
