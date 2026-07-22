import { useEffect, useId, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';

import { ATLAS_SERVERS, getBasicServants, readCachedBasicServantFace } from '../atlas/atlasService';
import type { SupportPolicy } from './supportPolicy';
import { CraftEssenceConditionEditor } from './CraftEssenceConditionEditor';
import {
  filterSupportServants,
  mergeSupportServants,
  resolveSupportServant,
  servantLabel,
  type SupportServantOption,
} from './supportSearch';

export function SupportEditor({
  policy,
  disabled,
  text,
  onChange,
}: {
  policy: SupportPolicy;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (policy: SupportPolicy) => void;
}) {
  const [servants, setServants] = useState<SupportServantOption[]>([]);
  const [query, setQuery] = useState('');
  const [catalogError, setCatalogError] = useState(false);
  const [selectionError, setSelectionError] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      ATLAS_SERVERS.map(async (server) => [server, await getBasicServants(server)] as const),
    ).then((results) => {
      if (!active) return;
      const entries = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const merged = mergeSupportServants(Object.fromEntries(entries));
      setServants(merged);
      setCatalogError(merged.length === 0);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedServant = useMemo(
    () => servants.find(({ servant }) => servant.id === policy.servantId)?.servant,
    [policy.servantId, servants],
  );
  const selectedFaceUrl = useServantFaceUrl(selectedServant?.id);

  useEffect(() => {
    if (
      !policy.servantId &&
      (policy.minServantLevel !== 0 || policy.minNoblePhantasmLevel !== 0)
    ) {
      onChange({ ...policy, minServantLevel: 0, minNoblePhantasmLevel: 0 });
    }
  }, [onChange, policy]);

  useEffect(() => {
    if (selectedServant) setQuery(servantLabel(selectedServant));
  }, [selectedServant]);

  const candidates = useMemo(() => filterSupportServants(servants, query), [query, servants]);

  const confirmServant = (option: SupportServantOption | undefined) => {
    setSelectionError(Boolean(query.trim()) && !option);
    if (!option) return;
    onChange({ ...policy, servantId: option.servant.id ?? 0 });
    setQuery(servantLabel(option.servant));
    setSearchFocused(false);
    setActiveCandidate(-1);
  };

  useEffect(() => {
    setActiveCandidate((current) => (current < candidates.length ? current : -1));
  }, [candidates.length]);

  const updateNumber = (field: keyof SupportPolicy, value: number) =>
    onChange({ ...policy, [field]: value });

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <section className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <h4 className="font-medium text-text-primary">{text('support.target')}</h4>
        </div>

        <label className="block space-y-1 text-sm text-text-secondary">
          <span>{text('support.servant')}</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchFocused && candidates.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={
                activeCandidate >= 0 ? `${listboxId}-${activeCandidate}` : undefined
              }
              disabled={disabled || catalogError}
              placeholder={text('support.servant_placeholder')}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                setSelectionError(false);
                setSearchFocused(true);
                setActiveCandidate(-1);
                if (!next.trim()) onChange({ ...policy, servantId: 0 });
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && candidates.length > 0) {
                  event.preventDefault();
                  setSearchFocused(true);
                  setActiveCandidate((current) => (current + 1) % candidates.length);
                } else if (event.key === 'ArrowUp' && candidates.length > 0) {
                  event.preventDefault();
                  setSearchFocused(true);
                  setActiveCandidate((current) =>
                    current <= 0 ? candidates.length - 1 : current - 1,
                  );
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmServant(
                    activeCandidate >= 0
                      ? candidates[activeCandidate]
                      : resolveSupportServant(servants, query),
                  );
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setSearchFocused(false);
                  setActiveCandidate(-1);
                }
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full rounded-lg border border-border bg-bg-primary py-2 pl-9 pr-3 text-text-primary"
            />
            {searchFocused && candidates.length > 0 && (
              <div
                id={listboxId}
                role="listbox"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-bg-primary p-1 shadow-lg"
              >
                {candidates.map((option, index) => (
                  <button
                    key={option.servant.id}
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeCandidate === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => confirmServant(option)}
                    onMouseEnter={() => setActiveCandidate(index)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      activeCandidate === index ? 'bg-bg-hover' : 'hover:bg-bg-hover'
                    }`}
                  >
                    <span className="font-medium text-text-primary">{option.servant.name}</span>
                    <span className="text-text-muted">
                      {option.servant.className} · #{option.servant.collectionNo}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </label>

        {catalogError && <p className="text-xs text-warning">{text('support.catalog_missing')}</p>}
        {selectionError && <p className="text-xs text-warning">{text('support.not_found')}</p>}
        {!policy.servantId && !policy.craftEssenceId && (
          <p className="text-xs text-warning">{text('support.any_hint')}</p>
        )}
        {selectedServant && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-primary p-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-secondary">
              {selectedFaceUrl ? (
                <img
                  src={selectedFaceUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <Users className="h-6 w-6 text-text-muted" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-xs text-text-muted">#{selectedServant.collectionNo}</div>
              <div className="inline-flex rounded-full bg-accent/10 px-2.5 py-1 text-sm font-medium capitalize text-accent">
                {selectedServant.className || '—'}
              </div>
            </div>
          </div>
        )}

        <CraftEssenceConditionEditor
          policy={policy}
          disabled={disabled}
          text={text}
          onChange={onChange}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-bg-secondary p-4">
        <h4 className="font-medium text-text-primary">{text('support.filters')}</h4>
        <p className="text-xs text-text-muted">{text('support.zero_hint')}</p>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={text('support.min_level')}
            value={policy.servantId ? policy.minServantLevel : undefined}
            max={120}
            disabled={disabled || !policy.servantId}
            onChange={(value) => updateNumber('minServantLevel', value)}
          />
          <NumberField
            label={text('support.min_np')}
            value={policy.servantId ? policy.minNoblePhantasmLevel : undefined}
            max={5}
            disabled={disabled || !policy.servantId}
            onChange={(value) => updateNumber('minNoblePhantasmLevel', value)}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-text-secondary">{text('support.max_skills')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {policy.requireMaxSkills.map((required, index) => (
              <label
                key={index}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
              >
                <input
                  type="checkbox"
                  checked={required}
                  disabled={disabled}
                  onChange={(event) => {
                    const requirements = [...policy.requireMaxSkills] as [
                      boolean,
                      boolean,
                      boolean,
                    ];
                    requirements[index] = event.target.checked;
                    onChange({ ...policy, requireMaxSkills: requirements });
                  }}
                  className="h-4 w-4 accent-accent"
                />
                <span>{text('support.skill').replace('{number}', String(index + 1))}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <NumberField
          label={text('support.max_refreshes')}
          value={policy.maxRefreshes}
          max={50}
          disabled={disabled}
          onChange={(value) => updateNumber('maxRefreshes', value)}
        />
      </section>
    </div>
  );
}

function useServantFaceUrl(id?: number): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);

    if (id) {
      void readCachedBasicServantFace(id).then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setUrl(objectUrl);
      });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return url;
}

function NumberField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value?: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));

  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Math.min(max, Math.max(0, Number.isFinite(parsed) ? Math.trunc(parsed) : 0));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <label className="block space-y-1 text-sm text-text-secondary">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }}
        className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
      />
    </label>
  );
}
