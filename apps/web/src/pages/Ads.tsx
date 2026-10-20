import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { formatDateTime } from '../components/formatDate';
import { ApiError, apiFetch } from '../lib/api';
import type { AdItem } from '../lib/types';

/**
 * Anúncios Click-to-WhatsApp. Cada um aparece aqui sozinho quando traz o primeiro lead;
 * o dono dá um nome legível e o imóvel, que passam a aparecer nos leads e nos indicadores.
 */
export function Ads() {
  const [items, setItems] = useState<AdItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: AdItem[] }>('/ads')
      .then(({ items }) => setItems(items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os anúncios.'));
  }, []);

  const unnamed = items?.filter((ad) => !ad.name).length ?? 0;

  return (
    <section className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Anúncios</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Cada anúncio de "Clique para o WhatsApp" aparece aqui quando traz o primeiro cliente. Dê um nome que você reconheça
        e o imóvel: eles passam a aparecer nos leads, nas visitas e nos indicadores no lugar do número do anúncio.
      </p>

      {error && <p className="mt-6 text-danger">{error}</p>}
      {!items && !error && <p className="mt-10 text-muted">Carregando…</p>}

      {items && items.length === 0 && (
        <p className="mt-10 max-w-md text-muted">
          Nenhum anúncio trouxe clientes ainda. Para testar sem campanha, rode na API:{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-sm">npm run chat -- --anuncio 123</code>
        </p>
      )}

      {items && items.length > 0 && (
        <>
          {unnamed > 0 && (
            <p className="mt-6 text-sm">
              <span className="font-semibold text-warm">{unnamed === 1 ? '1 anúncio sem nome.' : `${unnamed} anúncios sem nome.`}</span>{' '}
              <span className="text-muted">Enquanto isso, o painel mostra o título que a Meta enviou.</span>
            </p>
          )}
          <ul className="mt-4 divide-y divide-line border-y border-line bg-surface">
            {items.map((ad) => (
              <li key={ad.id}>
                <AdRow ad={ad} onSaved={(saved) => setItems((list) => list?.map((a) => (a.id === saved.id ? saved : a)) ?? null)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function AdRow({ ad, onSaved }: { ad: AdItem; onSaved: (ad: AdItem) => void }) {
  const [name, setName] = useState(ad.name ?? '');
  const [reference, setReference] = useState(ad.propertyReference ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const changed = name.trim() !== (ad.name ?? '') || reference.trim() !== (ad.propertyReference ?? '');

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<{ name: string | null; propertyReference: string | null }>(`/ads/${ad.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() || null, propertyReference: reference.trim() || null }),
      });
      onSaved({ ...ad, ...saved });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const field = 'mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-pine';

  return (
    <form onSubmit={save} className="px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">
          {ad.name || ad.headline || `Anúncio ${ad.adId}`}
          {!ad.name && <span className="ml-2 rounded-full bg-warm-soft px-2 py-0.5 text-xs font-semibold text-warm">Sem nome</span>}
        </p>
        <p className="tabular text-sm text-muted">
          {ad.leads} {ad.leads === 1 ? 'lead' : 'leads'}, {ad.won} {ad.won === 1 ? 'fechou' : 'fecharam'}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        ID do anúncio <span className="tabular">{ad.adId}</span>
        {ad.headline && <> · título na Meta: {ad.headline}</>} · primeiro lead em {formatDateTime(ad.createdAt)}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] md:items-end">
        <label className="block text-sm font-medium">
          Nome no painel
          <input value={name} maxLength={80} placeholder="Ex.: Apto 3 quartos, Torre A" onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="block text-sm font-medium">
          Imóvel
          <input value={reference} maxLength={120} placeholder="Ex.: REF-101" onChange={(e) => setReference(e.target.value)} className={field} />
        </label>
        <button
          type="submit"
          disabled={!changed || saving}
          className="h-9 rounded-md bg-pine px-4 text-sm font-semibold text-white hover:bg-pine-dark disabled:opacity-40"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      <p className="mt-1.5 h-4 text-xs" aria-live="polite">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : savedFlash ? (
          <span className="flex items-center gap-1 text-pine">
            <Check size={13} aria-hidden /> Salvo. Os leads deste anúncio já mostram o novo nome.
          </span>
        ) : null}
      </p>
    </form>
  );
}
