import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, Image, Search, Users } from 'lucide-react';

import {
  CHINESE_ATLAS_SERVERS,
  downloadCraftEssenceImage,
  ensureCraftEssences,
  getBasicServants,
  getCraftEssences,
  readCachedBasicServantFace,
  readCachedCraftEssenceFace,
  type AtlasCraftEssenceEntry,
  type AtlasServer,
} from '../atlas/atlasService';
import type { BattlePlan, PartySlot } from './battlePlan';
import { supportCraftEssences, type SupportPolicy } from './supportPolicy';
import {
  craftEssenceLabel,
  filterCraftEssences,
  mergeCraftEssenceOptions,
  resolveCraftEssence,
  type CraftEssenceOption,
} from './craftEssenceSearch';
import { setPartySupport, updatePartySlot } from './partyDraft';
import {
  filterSupportServants,
  mergeSupportServants,
  resolveSupportServant,
  servantLabel,
  type SupportServantOption,
} from './supportSearch';

export function PartyEditor({
  scopeServer,
  displayServer,
  plan,
  supportPolicy,
  disabled,
  text,
  onChange,
}: {
  scopeServer: AtlasServer;
  displayServer: AtlasServer;
  plan: BattlePlan;
  supportPolicy: SupportPolicy;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (plan: BattlePlan) => void;
}) {
  const [servants, setServants] = useState<SupportServantOption[]>([]);
  const [craftEssences, setCraftEssences] = useState<CraftEssenceOption[]>([]);
  const [catalogMissing, setCatalogMissing] = useState(false);
  const [craftEssenceLoading, setCraftEssenceLoading] = useState(false);
  const [craftEssenceError, setCraftEssenceError] = useState(false);
  const craftEssenceLoadingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setServants([]);
    setCraftEssences([]);
    void Promise.allSettled(
      CHINESE_ATLAS_SERVERS.map(
        async (server) => [server, await getBasicServants(server)] as const,
      ),
    ).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const merged = mergeSupportServants(Object.fromEntries(entries), scopeServer, displayServer);
      setServants(merged);
      setCatalogMissing(merged.length === 0);
    });
    void Promise.all(
      CHINESE_ATLAS_SERVERS.map(
        async (server) => [server, await getCraftEssences(server)] as const,
      ),
    ).then((entries) => {
      if (active) {
        setCraftEssences(
          mergeCraftEssenceOptions(Object.fromEntries(entries), scopeServer, displayServer),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [displayServer, scopeServer]);

  const loadCraftEssences = useCallback(async () => {
    if (craftEssenceLoadingRef.current || craftEssences.length > 0) return;
    craftEssenceLoadingRef.current = true;
    setCraftEssenceLoading(true);
    setCraftEssenceError(false);
    try {
      const entries = await Promise.all(
        CHINESE_ATLAS_SERVERS.map(
          async (server) => [server, await ensureCraftEssences(server)] as const,
        ),
      );
      setCraftEssences(
        mergeCraftEssenceOptions(Object.fromEntries(entries), scopeServer, displayServer),
      );
    } catch {
      setCraftEssenceError(true);
    } finally {
      craftEssenceLoadingRef.current = false;
      setCraftEssenceLoading(false);
    }
  }, [craftEssences.length, displayServer, scopeServer]);

  const updateSlot = (slot: number, patch: Partial<PartySlot> | null) => {
    onChange({ ...plan, party: updatePartySlot(plan.party, slot, patch) });
  };

  const markSupport = (slot: number, support: boolean) =>
    onChange({ ...plan, party: setPartySupport(plan.party, slot, support) });

  return (
    <div className="space-y-4">
      {catalogMissing && <p className="text-xs text-warning">{text('party.catalog_missing')}</p>}
      {craftEssenceLoading && <p className="text-xs text-text-muted">{text('party.ce_loading')}</p>}
      {craftEssenceError && <p className="text-xs text-warning">{text('party.ce_failed')}</p>}
      {[
        { title: text('party.front'), slots: [1, 2, 3] },
        { title: text('party.back'), slots: [4, 5, 6] },
      ].map((row) => (
        <section key={row.title} className="space-y-3">
          <h4 className="text-sm font-medium text-text-secondary">{row.title}</h4>
          <div className="grid gap-3 md:grid-cols-3">
            {row.slots.map((slot) => (
              <PartySlotCard
                scopeServer={scopeServer}
                key={slot}
                slot={slot}
                member={plan.party.find((item) => item.slot === slot)}
                supportPolicy={supportPolicy}
                servants={servants}
                craftEssences={craftEssences}
                disabled={disabled || catalogMissing}
                text={text}
                loadCraftEssences={loadCraftEssences}
                onChange={(patch) => updateSlot(slot, patch)}
                onSupportChange={(support) => markSupport(slot, support)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PartySlotCard({
  scopeServer,
  slot,
  member,
  supportPolicy,
  servants,
  craftEssences,
  disabled,
  text,
  loadCraftEssences,
  onChange,
  onSupportChange,
}: {
  scopeServer: AtlasServer;
  slot: number;
  member?: PartySlot;
  supportPolicy: SupportPolicy;
  servants: SupportServantOption[];
  craftEssences: CraftEssenceOption[];
  disabled: boolean;
  text: (key: string) => string;
  loadCraftEssences: () => Promise<void>;
  onChange: (patch: Partial<PartySlot> | null) => void;
  onSupportChange: (support: boolean) => void;
}) {
  const selectedServant = servants.find(
    ({ servant }) => servant.id === (member?.support ? supportPolicy.servantId : member?.servantId),
  )?.servant;
  const selectedCraftEssence = craftEssences.find(
    ({ craftEssence }) =>
      craftEssence.id === (member?.support ? supportPolicy.craftEssenceId : member?.craftEssenceId),
  )?.craftEssence;
  const supportCraftEssenceNames = supportCraftEssences(supportPolicy).map(
    ({ id }) =>
      craftEssences.find(({ craftEssence }) => craftEssence.id === id)?.craftEssence.name ??
      `#${id}`,
  );

  return (
    <article className="space-y-3 rounded-xl border border-border bg-bg-secondary p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">
          {text('party.slot').replace('{number}', String(slot))}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={Boolean(member?.support)}
            disabled={disabled}
            onChange={(event) => onSupportChange(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          {text('party.support')}
        </label>
      </div>

      <ServantSlotField
        selected={selectedServant}
        options={servants}
        disabled={disabled || Boolean(member?.support)}
        text={text}
        onSelect={(servantId) => (servantId ? onChange({ servantId }) : onChange(null))}
      />

      {member?.support ? (
        <div
          className={`grid gap-2 border-t border-border pt-3 ${supportPolicy.servantType === 'grand' ? 'grid-cols-2' : 'grid-cols-1'}`}
        >
          {(supportPolicy.servantType === 'grand'
            ? ['party.normal_ce', 'party.reward_ce']
            : ['party.ce_candidates']
          ).map((label) => (
            <div key={label} className="min-w-0 rounded-lg bg-bg-primary px-2.5 py-2">
              <div className="text-[11px] text-text-muted">{text(label)}</div>
              <div className="truncate text-xs text-text-primary">
                {supportCraftEssenceNames.length > 0
                  ? supportCraftEssenceNames.join(' / ')
                  : text('party.ce_none')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CraftEssenceSlotField
          scopeServer={scopeServer}
          selected={selectedCraftEssence}
          options={craftEssences}
          disabled={disabled || !member}
          text={text}
          loadOptions={loadCraftEssences}
          onSelect={(craftEssenceId) => onChange({ craftEssenceId: craftEssenceId || undefined })}
        />
      )}
    </article>
  );
}

function ServantSlotField({
  selected,
  options,
  disabled,
  text,
  onSelect,
}: {
  selected?: SupportServantOption['servant'];
  options: SupportServantOption[];
  disabled: boolean;
  text: (key: string) => string;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const listboxId = useId();
  const candidates = useMemo(() => filterSupportServants(options, query), [options, query]);
  const faceUrl = useCachedImage(selected?.id, readCachedBasicServantFace);

  useEffect(() => {
    setQuery(selected ? servantLabel(selected) : '');
  }, [selected]);

  const confirm = (option?: SupportServantOption) => {
    if (!option) return;
    onSelect(option.servant.id ?? 0);
    setQuery(servantLabel(option.servant));
    setFocused(false);
    setActive(-1);
  };

  return (
    <div className="space-y-2">
      <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-bg-primary">
        {faceUrl ? (
          <img src={faceUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Users className="h-5 w-5 text-text-muted" />
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          role="combobox"
          aria-expanded={focused && candidates.length > 0}
          aria-controls={listboxId}
          disabled={disabled}
          placeholder={text('party.servant_placeholder')}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setFocused(true);
            setActive(-1);
            if (!event.target.value.trim()) onSelect(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && candidates.length > 0) {
              event.preventDefault();
              setActive((current) => (current + 1) % candidates.length);
            } else if (event.key === 'ArrowUp' && candidates.length > 0) {
              event.preventDefault();
              setActive((current) => (current <= 0 ? candidates.length - 1 : current - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              confirm(active >= 0 ? candidates[active] : resolveSupportServant(options, query));
            } else if (event.key === 'Escape') {
              setFocused(false);
            }
          }}
          className="w-full rounded-lg border border-border bg-bg-primary py-2 pl-8 pr-2 text-sm text-text-primary"
        />
        {focused && candidates.length > 0 && (
          <CandidateList
            id={listboxId}
            active={active}
            candidates={candidates.map((option) => ({
              key: option.servant.id ?? 0,
              label: option.servant.name,
              meta: `#${option.servant.collectionNo}`,
            }))}
            onHover={setActive}
            onSelect={(index) => confirm(candidates[index])}
          />
        )}
      </div>
    </div>
  );
}

function CraftEssenceSlotField({
  scopeServer,
  selected,
  options,
  disabled,
  text,
  loadOptions,
  onSelect,
}: {
  scopeServer: AtlasServer;
  selected?: AtlasCraftEssenceEntry;
  options: CraftEssenceOption[];
  disabled: boolean;
  text: (key: string) => string;
  loadOptions: () => Promise<void>;
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const listboxId = useId();
  const candidates = useMemo(() => filterCraftEssences(options, query), [options, query]);
  const imageUrl = useCraftEssenceImage(scopeServer, selected, imageVersion);

  useEffect(() => {
    setQuery(selected ? craftEssenceLabel(selected) : '');
  }, [selected]);

  const confirm = (option?: CraftEssenceOption) => {
    if (!option) return;
    onSelect(option.craftEssence.id ?? 0);
    setQuery(craftEssenceLabel(option.craftEssence));
    setFocused(false);
    setActive(-1);
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <button
        type="button"
        disabled={disabled || !selected || downloading || Boolean(imageUrl)}
        title={selected && !imageUrl ? text('party.ce_download') : undefined}
        onClick={async () => {
          if (!selected) return;
          setDownloading(true);
          setDownloadError(false);
          try {
            await downloadCraftEssenceImage(scopeServer, selected.collectionNo ?? selected.id ?? 0);
            setImageVersion((current) => current + 1);
          } catch {
            setDownloadError(true);
          } finally {
            setDownloading(false);
          }
        }}
        className="mx-auto flex h-10 w-16 items-center justify-center overflow-hidden rounded-md bg-bg-primary text-text-muted"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : downloading ? (
          <Download className="h-4 w-4 animate-pulse" />
        ) : (
          <Image className="h-5 w-5" />
        )}
      </button>
      <div className="relative">
        <input
          value={query}
          role="combobox"
          aria-expanded={focused && candidates.length > 0}
          aria-controls={listboxId}
          disabled={disabled}
          placeholder={text('party.ce_placeholder')}
          onFocus={() => {
            setFocused(true);
            if (options.length === 0) void loadOptions();
          }}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setFocused(true);
            setActive(-1);
            if (!event.target.value.trim()) onSelect(0);
            if (options.length === 0) void loadOptions();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && candidates.length > 0) {
              event.preventDefault();
              setActive((current) => (current + 1) % candidates.length);
            } else if (event.key === 'ArrowUp' && candidates.length > 0) {
              event.preventDefault();
              setActive((current) => (current <= 0 ? candidates.length - 1 : current - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              confirm(active >= 0 ? candidates[active] : resolveCraftEssence(options, query));
            } else if (event.key === 'Escape') {
              setFocused(false);
            }
          }}
          className="w-full rounded-lg border border-border bg-bg-primary px-2.5 py-2 text-sm text-text-primary"
        />
        {focused && candidates.length > 0 && (
          <CandidateList
            id={listboxId}
            active={active}
            candidates={candidates.map((option) => ({
              key: option.craftEssence.id ?? 0,
              label: option.craftEssence.name,
              meta: `#${option.craftEssence.collectionNo}`,
            }))}
            onHover={setActive}
            onSelect={(index) => confirm(candidates[index])}
          />
        )}
      </div>
      {downloadError && <p className="text-xs text-warning">{text('party.ce_failed')}</p>}
    </div>
  );
}

function CandidateList({
  id,
  active,
  candidates,
  onHover,
  onSelect,
}: {
  id: string;
  active: number;
  candidates: { key: number; label: string; meta: string }[];
  onHover: (index: number) => void;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      id={id}
      role="listbox"
      className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-bg-primary p-1 shadow-lg"
    >
      {candidates.map((candidate, index) => (
        <button
          key={candidate.key}
          type="button"
          role="option"
          aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(index)}
          className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
            active === index ? 'bg-bg-hover' : 'hover:bg-bg-hover'
          }`}
        >
          <span className="truncate text-text-primary">{candidate.label}</span>
          <span className="shrink-0 text-text-muted">{candidate.meta}</span>
        </button>
      ))}
    </div>
  );
}

function useCachedImage(
  id: number | undefined,
  read: (id: number) => Promise<Uint8Array | null>,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (id) {
      void read(id).then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setUrl(objectUrl);
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, read]);
  return url;
}

function useCraftEssenceImage(
  server: AtlasServer,
  craftEssence: AtlasCraftEssenceEntry | undefined,
  version: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (craftEssence) {
      void readCachedCraftEssenceFace(server, craftEssence).then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setUrl(objectUrl);
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [craftEssence, server, version]);
  return url;
}
