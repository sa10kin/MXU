import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Download,
  Image,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  ATLAS_SERVERS,
  downloadCraftEssenceImage,
  ensureCraftEssences,
  getBasicServants,
  getCachedCraftEssenceIds,
  getCraftEssences,
  readCachedBasicServantFace,
  readCachedCraftEssenceFace,
  type AtlasBasicServantEntry,
  type AtlasCraftEssenceEntry,
  type AtlasServer,
} from './atlasService';
import { loadAtlasAliases, saveAtlasAliases, type AtlasAliases } from './atlasAliases';
import { classIconRemoteUrl, resolveClassIconSrc } from './classIcons';
import type { BattlePlan } from '../automation/battlePlan';

type BrowserTab = 'servants' | 'craftEssences' | 'presets';
type AliasDataset = Exclude<BrowserTab, 'presets'>;

interface BattlePreset {
  id: string;
  name: string;
  updatedAt?: string;
  plan: BattlePlan;
}

export const BATTLE_PRESET_STORAGE_KEY = 'papermoon-battle-presets-v1';

const CLASS_FILTERS = [
  { key: 'saber', iconId: 1, label: 'Saber' },
  { key: 'archer', iconId: 2, label: 'Archer' },
  { key: 'lancer', iconId: 3, label: 'Lancer' },
  { key: 'rider', iconId: 4, label: 'Rider' },
  { key: 'caster', iconId: 5, label: 'Caster' },
  { key: 'assassin', iconId: 6, label: 'Assassin' },
  { key: 'berserker', iconId: 7, label: 'Berserker' },
  { key: 'ruler', iconId: 9, label: 'Ruler' },
  { key: 'alterego', iconId: 10, label: 'AlterEgo' },
  { key: 'avenger', iconId: 11, label: 'Avenger' },
  { key: 'mooncancer', iconId: 23, label: 'MoonCancer' },
  { key: 'foreigner', iconId: 25, label: 'Foreigner' },
  { key: 'pretender', iconId: 28, label: 'Pretender' },
  { key: 'shielder', iconId: 8, label: 'Shielder' },
  { key: 'beast', iconId: 33, label: 'Beast' },
  { key: 'unknown', iconId: 97, label: 'Unknown' },
];
const STANDARD_CLASSES = new Set(CLASS_FILTERS.map(({ key }) => key).filter((key) => key !== 'unknown'));

export function AtlasBrowserPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<BrowserTab>('servants');
  const [server, setServer] = useState<AtlasServer>('TW');
  const [servants, setServants] = useState<AtlasBasicServantEntry[]>([]);
  const [craftEssences, setCraftEssences] = useState<AtlasCraftEssenceEntry[]>([]);
  const [aliases, setAliases] = useState<AtlasAliases>(loadAtlasAliases);
  const [presets, setPresets] = useState<BattlePreset[]>(loadPresets);
  const [query, setQuery] = useState('');
  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cacheScanning, setCacheScanning] = useState(false);
  const [cachedCraftEssenceIds, setCachedCraftEssenceIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<BattlePreset | null>(null);
  const [deletePreset, setDeletePreset] = useState<BattlePreset | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([getBasicServants(server), getCraftEssences(server)])
      .then(([nextServants, nextCraftEssences]) => {
        if (!active) return;
        setServants(nextServants);
        setCraftEssences(nextCraftEssences);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [server]);

  useEffect(() => {
    let active = true;
    if (craftEssences.length === 0) {
      setCachedCraftEssenceIds(new Set());
      return () => {
        active = false;
      };
    }
    setCacheScanning(true);
    void getCachedCraftEssenceIds(server, craftEssences)
      .then((ids) => {
        if (active) setCachedCraftEssenceIds(ids);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setCacheScanning(false);
      });
    return () => {
      active = false;
    };
  }, [craftEssences, server]);

  useEffect(() => {
    setQuery('');
    setClassName('');
  }, [tab, server]);

  const visibleServants = useMemo(
    () =>
      servants
        .filter((servant) => matchesClassFilter(servant.className, className))
        .filter((servant) => matchesEntry(servant, aliases.servants, query)),
    [aliases.servants, className, query, servants],
  );
  const visibleCraftEssences = useMemo(
    () =>
      craftEssences
        .filter((craftEssence) => matchesEntry(craftEssence, aliases.craftEssences, query))
        .filter(
          (craftEssence) =>
            Boolean(query.trim()) ||
            Boolean(craftEssence.id && cachedCraftEssenceIds.has(craftEssence.id)),
        )
        .slice(0, 240),
    [aliases.craftEssences, cachedCraftEssenceIds, craftEssences, query],
  );

  const updateAliases = (dataset: AliasDataset, id: string, value: string) => {
    const next = {
      ...aliases,
      [dataset]: {
        ...aliases[dataset],
        [id]: value
          .split(',')
          .map((alias) => alias.trim())
          .filter(Boolean),
      },
    };
    setAliases(next);
    saveAtlasAliases(next);
  };

  const loadCraftEssenceCatalog = async () => {
    setCatalogLoading(true);
    setError('');
    try {
      setCraftEssences(await ensureCraftEssences(server));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCatalogLoading(false);
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <header className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          title={t('common.close')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t('atlasBrowser.title')}</h1>
          <p className="mt-0.5 text-sm text-text-muted">{t('atlasBrowser.subtitle')}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="inline-flex rounded-xl border border-border bg-bg-secondary p-1">
              <TabButton
                active={tab === 'servants'}
                icon={<Users className="h-4 w-4" />}
                label={t('atlasBrowser.servants')}
                onClick={() => setTab('servants')}
              />
              <TabButton
                active={tab === 'craftEssences'}
                icon={<Sparkles className="h-4 w-4" />}
                label={t('atlasBrowser.craftEssences')}
                onClick={() => setTab('craftEssences')}
              />
              <TabButton
                active={tab === 'presets'}
                icon={<Shield className="h-4 w-4" />}
                label={t('atlasBrowser.presets')}
                onClick={() => setTab('presets')}
              />
            </nav>

            {tab !== 'presets' && (
              <div className="inline-flex rounded-lg bg-bg-secondary p-1" role="tablist">
                {ATLAS_SERVERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setServer(item)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                      server === item
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tab !== 'presets' && (
            <section className="space-y-3 rounded-2xl border border-border bg-bg-secondary p-4">
              <label className="relative min-w-64 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    tab === 'servants'
                      ? t('atlasBrowser.searchServants')
                      : t('atlasBrowser.searchCraftEssences')
                  }
                  className="w-full rounded-xl border border-border bg-bg-primary py-2.5 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                />
              </label>
              {tab === 'servants' && (
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('atlasBrowser.allClasses')}>
                  <ClassFilterButton
                    active={!className}
                    iconId={1001}
                    label={t('atlasBrowser.allClasses')}
                    onClick={() => setClassName('')}
                  />
                  {CLASS_FILTERS.map(({ key, iconId, label }) => (
                    <ClassFilterButton
                      key={key}
                      active={className === key}
                      iconId={iconId}
                      label={label}
                      onClick={() => setClassName(key)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {error && <p className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

          {tab === 'servants' && (
            <CatalogGrid
              loading={loading}
              empty={servants.length === 0}
              emptyText={t('atlasBrowser.servantCatalogMissing')}
            >
              {visibleServants.map((servant) => {
                const id = String(servant.collectionNo ?? servant.id ?? '');
                return (
                  <ServantCard
                    key={servant.id ?? id}
                    servant={servant}
                    aliases={(aliases.servants[id] ?? []).join(', ')}
                    onAliasesChange={(value) => updateAliases('servants', id, value)}
                  />
                );
              })}
            </CatalogGrid>
          )}

          {tab === 'craftEssences' && (
            <CatalogGrid
              loading={loading || catalogLoading || cacheScanning}
              empty={visibleCraftEssences.length === 0}
              emptyText={
                craftEssences.length === 0
                  ? t('atlasBrowser.craftEssenceCatalogMissing')
                  : query.trim()
                    ? t('atlasBrowser.noMatches')
                    : t('atlasBrowser.noCachedCraftEssences')
              }
              action={
                craftEssences.length === 0 ? (
                  <button
                    type="button"
                    disabled={catalogLoading}
                    onClick={() => void loadCraftEssenceCatalog()}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {catalogLoading ? t('common.loading') : t('atlasBrowser.loadCraftEssences')}
                  </button>
                ) : undefined
              }
            >
              {visibleCraftEssences.map((craftEssence) => {
                const id = String(craftEssence.collectionNo ?? craftEssence.id ?? '');
                return (
                  <CraftEssenceCard
                    key={craftEssence.id ?? id}
                    server={server}
                    craftEssence={craftEssence}
                    aliases={(aliases.craftEssences[id] ?? []).join(', ')}
                    onAliasesChange={(value) => updateAliases('craftEssences', id, value)}
                    onCached={() => {
                      if (!craftEssence.id) return;
                      setCachedCraftEssenceIds((current) => new Set(current).add(craftEssence.id!));
                    }}
                  />
                );
              })}
            </CatalogGrid>
          )}

          {tab === 'presets' && (
            <PresetList
              presets={presets}
              selected={selectedPreset}
              onSelect={setSelectedPreset}
              onDelete={setDeletePreset}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deletePreset !== null}
        title={t('atlasBrowser.deletePresetTitle')}
        message={t('atlasBrowser.deletePresetMessage', { name: deletePreset?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (!deletePreset) return;
          const next = presets.filter((preset) => preset.id !== deletePreset.id);
          localStorage.setItem(BATTLE_PRESET_STORAGE_KEY, JSON.stringify(next));
          setPresets(next);
          if (selectedPreset?.id === deletePreset.id) setSelectedPreset(null);
          setDeletePreset(null);
        }}
        onCancel={() => setDeletePreset(null)}
      />
    </main>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ClassIconImage({ iconId, active }: { iconId: number; active: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    resolveClassIconSrc(iconId, active).then((resolved) => {
      if (alive) setSrc(resolved);
    });
    return () => {
      alive = false;
    };
  }, [iconId, active]);
  return (
    <img
      src={src ?? classIconRemoteUrl(iconId, active)}
      alt=""
      className="h-10 w-10 object-contain"
      draggable={false}
    />
  );
}

function ClassFilterButton({
  active,
  icon,
  iconId,
  label,
  onClick,
}: {
  active: boolean;
  icon?: React.ReactNode;
  iconId?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={label}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        active
          ? 'border-accent bg-accent text-white shadow-sm'
          : 'border-border bg-bg-primary text-text-muted hover:border-accent/50 hover:text-text-primary'
      }`}
    >
      {iconId ? <ClassIconImage iconId={iconId} active={active} /> : icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function CatalogGrid({
  loading,
  empty,
  emptyText,
  action,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) {
    return <p className="py-16 text-center text-sm text-text-muted">{t('common.loading')}</p>;
  }
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="mb-4 text-sm text-text-muted">{emptyText}</p>
        {action}
      </div>
    );
  }
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function ServantCard({
  servant,
  aliases,
  onAliasesChange,
}: {
  servant: AtlasBasicServantEntry;
  aliases: string;
  onAliasesChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const imageUrl = useCachedImage(() => readCachedBasicServantFace(servant.id ?? 0), servant.id);
  return (
    <article className="flex gap-3 rounded-2xl border border-border bg-bg-secondary p-3 transition-colors hover:border-accent/40">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-primary">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Users className="h-6 w-6 text-text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-text-primary">{servant.name}</h3>
          <span className="shrink-0 text-xs text-text-muted">#{servant.collectionNo}</span>
        </div>
        <span className="mt-1 inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium capitalize text-accent">
          {servant.className || '—'}
        </span>
        <input
          defaultValue={aliases}
          onBlur={(event) => onAliasesChange(event.target.value)}
          placeholder={t('atlasBrowser.aliasPlaceholder')}
          className="mt-2 w-full border-0 border-b border-border bg-transparent py-1 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>
    </article>
  );
}

function CraftEssenceCard({
  server,
  craftEssence,
  aliases,
  onAliasesChange,
  onCached,
}: {
  server: AtlasServer;
  craftEssence: AtlasCraftEssenceEntry;
  aliases: string;
  onAliasesChange: (value: string) => void;
  onCached: () => void;
}) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const imageUrl = useCachedImage(
    () => readCachedCraftEssenceFace(server, craftEssence),
    `${server}-${craftEssence.id}-${version}`,
  );
  return (
    <article className="flex gap-3 rounded-2xl border border-border bg-bg-secondary p-3 transition-colors hover:border-accent/40">
      <button
        type="button"
        disabled={Boolean(imageUrl) || downloading}
        onClick={async () => {
          setDownloading(true);
          setDownloadFailed(false);
          try {
            const result = await downloadCraftEssenceImage(
              server,
              craftEssence.collectionNo ?? craftEssence.id ?? 0,
            );
            if (result.downloaded + result.skipped === 0) {
              throw new Error('Craft essence image download failed.');
            }
            setVersion((current) => current + 1);
            onCached();
          } catch {
            setDownloadFailed(true);
          } finally {
            setDownloading(false);
          }
        }}
        title={
          imageUrl
            ? undefined
            : downloadFailed
              ? t('atlasBrowser.imageDownloadFailed')
              : t('atlasBrowser.downloadImage')
        }
        className={`flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-primary ${downloadFailed ? 'text-error' : 'text-text-muted'}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : downloading ? (
          <Download className="h-5 w-5 animate-pulse" />
        ) : (
          <Image className="h-5 w-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-text-primary">{craftEssence.name}</h3>
          <span className="shrink-0 text-xs text-text-muted">#{craftEssence.collectionNo}</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">★{craftEssence.rarity ?? '—'}</p>
        <input
          defaultValue={aliases}
          onBlur={(event) => onAliasesChange(event.target.value)}
          placeholder={t('atlasBrowser.aliasPlaceholder')}
          className="mt-2 w-full border-0 border-b border-border bg-transparent py-1 text-xs text-text-primary outline-none focus:border-accent"
        />
      </div>
    </article>
  );
}

function PresetList({
  presets,
  selected,
  onSelect,
  onDelete,
}: {
  presets: BattlePreset[];
  selected: BattlePreset | null;
  onSelect: (preset: BattlePreset | null) => void;
  onDelete: (preset: BattlePreset) => void;
}) {
  const { t } = useTranslation();
  if (presets.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <Shield className="mx-auto mb-3 h-8 w-8 text-text-muted" />
        <p className="text-sm text-text-muted">{t('atlasBrowser.noPresets')}</p>
        <p className="mt-1 text-xs text-text-muted">{t('atlasBrowser.presetHint')}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
      <div className="space-y-3">
        {presets.map((preset) => (
          <article key={preset.id} className="rounded-2xl border border-border bg-bg-secondary p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-text-primary">{preset.name}</h3>
                <p className="mt-1 text-xs text-text-muted">
                  {t('atlasBrowser.presetSummary', {
                    party: preset.plan.party.length,
                    waves: preset.plan.waves.length,
                    turns: preset.plan.waves.reduce((sum, wave) => sum + wave.turns.length, 0),
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(preset)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
                >
                  {t('atlasBrowser.details')}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(preset)}
                  className="rounded-lg p-1.5 text-error hover:bg-error/10"
                  title={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <aside className="rounded-2xl border border-border bg-bg-secondary p-4">
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-text-primary">{selected.name}</h3>
              <button type="button" onClick={() => onSelect(null)} className="text-xs text-accent">
                {t('common.close')}
              </button>
            </div>
            <DetailRow label={t('atlasBrowser.party')} value={String(selected.plan.party.length)} />
            <DetailRow label={t('atlasBrowser.maxTurns')} value={String(selected.plan.maxTurns)} />
            <div className="space-y-2">
              {selected.plan.party.map((member) => (
                <p
                  key={member.slot}
                  className="rounded-lg bg-bg-primary px-3 py-2 text-xs text-text-secondary"
                >
                  {t('atlasBrowser.partySlot', {
                    slot: member.slot,
                    servant: member.support ? t('atlasBrowser.support') : (member.servantId ?? '—'),
                    craftEssence: member.craftEssenceId ?? '—',
                  })}
                </p>
              ))}
            </div>
            {selected.plan.waves.map((wave, index) => (
              <div key={index} className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-text-primary">
                    {t('atlasBrowser.wave', { index: index + 1 })}
                  </span>
                  <span className="text-text-muted">
                    {t('atlasBrowser.turns', { count: wave.turns.length })}
                  </span>
                </div>
                {wave.turns.map((turn, turnIndex) => (
                  <div key={turnIndex} className="rounded-lg bg-bg-primary px-3 py-2">
                    <p className="text-xs font-medium text-text-secondary">
                      {t('atlasBrowser.turn', { index: turnIndex + 1 })}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {turn.actions
                        .map((action) =>
                          t(`atlasBrowser.actionTypes.${action.type}`, {
                            defaultValue: action.type,
                          }),
                        )
                        .join(' → ')}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t('atlasBrowser.selectPreset')}</p>
        )}
      </aside>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}

function useCachedImage(loader: () => Promise<Uint8Array | null>, key: unknown): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    void loader().then((bytes) => {
      if (!active || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The caller passes the exact cache identity; recreating loader functions is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function matchesEntry(
  entry: {
    id?: number;
    collectionNo?: number;
    name: string;
    nameCn?: string;
    nameTw?: string;
    nameJp?: string;
  },
  aliases: Record<string, string[]>,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const id = String(entry.collectionNo ?? entry.id ?? '');
  return [entry.name, entry.nameCn, entry.nameTw, entry.nameJp, id, ...(aliases[id] ?? [])]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(needle));
}

function normalizeClassName(value?: string): string {
  return (value ?? '').toLocaleLowerCase().replace(/[^a-z]/g, '');
}

export function matchesClassFilter(value: string | undefined, filter: string): boolean {
  if (!filter) return true;
  const className = normalizeClassName(value);
  if (filter === 'beast') return className.startsWith('beast');
  return filter === 'unknown'
    ? !STANDARD_CLASSES.has(className) && !className.startsWith('beast')
    : className === filter;
}

function loadPresets(): BattlePreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(BATTLE_PRESET_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? (value as BattlePreset[]) : [];
  } catch {
    return [];
  }
}
