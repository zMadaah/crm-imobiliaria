import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, apiFetch } from '../lib/api';
import { TEMPERATURE_LABEL, TEMPERATURE_TEXT, temperatureFor } from '../lib/temperature';
import type { WeightGroup, WeightSettings } from '../lib/types';

const keyOf = (questionKey: string, answerKey: string) => `${questionKey}:${answerKey}`;

type Draft = Record<string, string>;

function toDraft(settings: WeightSettings): Draft {
  const draft: Draft = {};
  for (const group of settings.groups) {
    for (const answer of group.answers) draft[keyOf(group.questionKey, answer.answerKey)] = String(answer.points);
  }
  return draft;
}

function parsePoints(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100 ? number : null;
}

export function ScoreSettings() {
  const [settings, setSettings] = useState<WeightSettings | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<WeightSettings>('/score-weights')
      .then((data) => {
        setSettings(data);
        setDraft(toDraft(data));
      })
      .catch((error) => setLoadError(error instanceof ApiError ? error.message : 'Não foi possível carregar os pesos.'));
  }, []);

  const saved = useMemo(() => (settings ? toDraft(settings) : {}), [settings]);
  const changedKeys = Object.keys(draft).filter((key) => draft[key] !== saved[key]);
  const invalidKeys = Object.keys(draft).filter((key) => parsePoints(draft[key]) === null);

  async function save() {
    if (!settings || invalidKeys.length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const weights = changedKeys.map((key) => {
        const [questionKey, answerKey] = key.split(/:(.+)/);
        return { questionKey, answerKey, points: parsePoints(draft[key])! };
      });
      const updated = await apiFetch<WeightSettings>('/score-weights', {
        method: 'PUT',
        body: JSON.stringify({ weights }),
      });
      setSettings(updated);
      setDraft(toDraft(updated));
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? [error.message, ...error.details]
          : ['Não foi possível salvar. Tente novamente.'],
      );
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    if (!settings) return;
    const defaults: Draft = {};
    for (const group of settings.groups) {
      for (const answer of group.answers) {
        defaults[keyOf(group.questionKey, answer.answerKey)] = String(answer.defaultPoints);
      }
    }
    setDraft(defaults);
  }

  if (loadError) return <p className="text-danger">{loadError}</p>;
  if (!settings) return <p className="text-muted">Carregando pesos…</p>;

  return (
    <section>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Pontuação dos leads</h1>
        <p className="mt-2 text-muted">
          Cada resposta do cliente ao bot vale pontos. A soma define a temperatura: {settings.thresholds.hot} ou mais é
          quente, de {settings.thresholds.warm} a {settings.thresholds.hot - 1} é morno, abaixo disso é frio. As
          mudanças valem para os próximos leads; quem já foi pontuado mantém a nota.
        </p>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {settings.groups.map((group) => (
            <WeightGroupFields
              key={group.id}
              group={group}
              draft={draft}
              saved={saved}
              onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
            />
          ))}
          <button
            type="button"
            onClick={restoreDefaults}
            className="flex items-center gap-2 text-sm text-muted hover:text-ink"
          >
            <RotateCcw size={16} aria-hidden />
            Voltar todos para o padrão
          </button>
        </div>

        <ProfileTester settings={settings} draft={draft} />
      </div>

      {(changedKeys.length > 0 || saveError || savedAt) && (
        <div className="sticky bottom-0 -mx-5 mt-10 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur md:-mx-10 md:px-10">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm" aria-live="polite">
              {saveError ? (
                <span className="text-danger">{saveError.join(' ')}</span>
              ) : changedKeys.length > 0 ? (
                invalidKeys.length > 0 ? (
                  <span className="text-danger">Use números inteiros de 0 a 100 em todos os campos.</span>
                ) : (
                  `${changedKeys.length} ${changedKeys.length === 1 ? 'peso alterado' : 'pesos alterados'}`
                )
              ) : (
                <span className="text-pine">Pesos salvos. Já valem para os próximos leads.</span>
              )}
            </p>
            {changedKeys.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(saved);
                    setSaveError(null);
                  }}
                  className="rounded-md px-3 py-2 text-sm text-muted hover:bg-paper hover:text-ink"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || invalidKeys.length > 0}
                  className="rounded-md bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pine-dark disabled:opacity-50"
                >
                  {saving ? 'Salvando…' : 'Salvar pesos'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function WeightGroupFields({
  group,
  draft,
  saved,
  onChange,
}: {
  group: WeightGroup;
  draft: Draft;
  saved: Draft;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-lg font-semibold">{group.title}</legend>
      <div className="mt-3 divide-y divide-line border-y border-line">
        {group.answers.map((answer) => {
          const key = keyOf(group.questionKey, answer.answerKey);
          const inputId = `w-${group.id}-${answer.answerKey}`;
          const value = draft[key] ?? '';
          const invalid = parsePoints(value) === null;
          const changed = value !== saved[key];
          return (
            <div key={key} className="flex items-center gap-4 py-2.5">
              <label htmlFor={inputId} className="flex-1">
                {answer.label}
                {Number(value) !== answer.defaultPoints && !invalid && (
                  <span className="ml-2 text-sm text-muted">padrão {answer.defaultPoints}</span>
                )}
              </label>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={value}
                aria-invalid={invalid}
                onChange={(e) => onChange(key, e.target.value)}
                className={`tabular w-20 rounded-md border bg-surface px-2.5 py-1.5 text-right outline-none focus:border-pine ${
                  invalid ? 'border-danger' : changed ? 'border-pine' : 'border-line'
                }`}
              />
              <span className="w-6 text-sm text-muted" aria-hidden>
                pts
              </span>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Painel para o dono testar um perfil de cliente com os pesos que está editando,
 * antes de salvar. O cálculo oficial é sempre o do servidor.
 */
function ProfileTester({ settings, draft }: { settings: WeightSettings; draft: Draft }) {
  const [intent, setIntent] = useState<'buy' | 'rent'>('buy');
  const [choices, setChoices] = useState<Record<string, string>>({});

  const groups = settings.groups.filter((group) => {
    if (group.questionKey === 'intent') return false;
    if (group.id.endsWith('_buy')) return intent === 'buy';
    if (group.id.endsWith('_rent')) return intent === 'rent';
    return true;
  });

  const pointsOf = (questionKey: string, answerKey: string) => parsePoints(draft[keyOf(questionKey, answerKey)]) ?? 0;

  let total = pointsOf('intent', intent);
  for (const group of groups) {
    const answerKey = choices[group.id] ?? group.answers[0]?.answerKey;
    if (answerKey) total += pointsOf(group.questionKey, answerKey);
  }
  const score = Math.min(settings.maxScore, total);
  const temperature = temperatureFor(score, settings.thresholds);

  const maxPossible = Math.min(
    settings.maxScore,
    ['buy', 'rent']
      .map((option) => {
        let sum = pointsOf('intent', option);
        for (const group of settings.groups) {
          if (group.questionKey === 'intent') continue;
          if (group.id.endsWith(option === 'buy' ? '_rent' : '_buy')) continue;
          sum += Math.max(0, ...group.answers.map((a) => pointsOf(group.questionKey, a.answerKey)));
        }
        return sum;
      })
      .reduce((a, b) => Math.max(a, b), 0),
  );

  return (
    <aside className="self-start rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-6">
      <h2 className="font-semibold">Teste um perfil</h2>
      <p className="mt-1 text-sm text-muted">Escolha as respostas e veja a nota com os pesos da tela.</p>

      <ScoreGauge score={score} settings={settings} />
      <p className="mt-3 flex items-baseline gap-2">
        <span className="tabular text-4xl font-bold tracking-tight">{score}</span>
        <span className={`text-lg font-semibold ${TEMPERATURE_TEXT[temperature]}`}>{TEMPERATURE_LABEL[temperature]}</span>
      </p>
      <p className="text-sm text-muted">Perfil mais forte possível: {maxPossible} pontos</p>

      <div className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="text-muted">Comprar ou alugar</span>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as 'buy' | 'rent')}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-2"
          >
            <option value="buy">Comprar</option>
            <option value="rent">Alugar</option>
          </select>
        </label>
        {groups.map((group) => (
          <label key={group.id} className="block text-sm">
            <span className="text-muted">{group.title}</span>
            <select
              value={choices[group.id] ?? group.answers[0]?.answerKey}
              onChange={(e) => setChoices((current) => ({ ...current, [group.id]: e.target.value }))}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-2"
            >
              {group.answers.map((answer) => (
                <option key={answer.answerKey} value={answer.answerKey}>
                  {answer.label} ({pointsOf(group.questionKey, answer.answerKey)})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </aside>
  );
}

/** Régua de 0 a 100 com as três faixas e a posição do perfil testado. */
function ScoreGauge({ score, settings }: { score: number; settings: WeightSettings }) {
  const { warm, hot } = settings.thresholds;
  const max = settings.maxScore;
  const pct = (value: number) => `${(value / max) * 100}%`;

  return (
    <div className="mt-5" aria-hidden>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1 h-3 overflow-hidden rounded-full">
          <div className="absolute inset-y-0 left-0 bg-cold/35" style={{ width: pct(warm) }} />
          <div className="absolute inset-y-0 bg-warm/40" style={{ left: pct(warm), width: pct(hot - warm) }} />
          <div className="absolute inset-y-0 right-0 bg-hot/40" style={{ left: pct(hot) }} />
        </div>
        {/* Marcador do perfil: as faixas continuam visíveis em qualquer nota */}
        <div
          className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface transition-[left] duration-300"
          style={{ left: `clamp(2px, ${pct(score)}, calc(100% - 2px))` }}
        />
      </div>
      <div className="tabular relative mt-1 h-4 text-xs text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(warm) }}>
          {warm}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(hot) }}>
          {hot}
        </span>
        <span className="absolute right-0">{max}</span>
      </div>
    </div>
  );
}
