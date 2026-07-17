import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, Image } from 'lucide-react';

import {
  downloadCraftEssenceImage,
  ensureCraftEssences,
  getCraftEssences,
  readCachedCraftEssenceFace,
  type AtlasCraftEssenceEntry,
} from '../atlas/atlasService';
import {
  buildCraftEssenceOptions,
  craftEssenceLabel,
  filterCraftEssences,
  resolveCraftEssence,
  type CraftEssenceOption,
} from './craftEssenceSearch';
import type { SupportPolicy } from './supportPolicy';

export function CraftEssenceConditionEditor({
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
  const [options, setOptions] = useState<CraftEssenceOption[]>([]);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const loadingRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    let mounted = true;
    void getCraftEssences('TW').then((entries) => {
      if (mounted) setOptions(buildCraftEssenceOptions(entries));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadCatalog = async () => {
    if (loadingRef.current || options.length > 0) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      setOptions(buildCraftEssenceOptions(await ensureCraftEssences('TW')));
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const selected = useMemo(
    () =>
      options.find(({ craftEssence }) => craftEssence.id === policy.craftEssenceId)?.craftEssence,
    [options, policy.craftEssenceId],
  );
  const imageUrl = useCraftEssenceFaceUrl(selected, imageVersion);
  const candidates = useMemo(() => filterCraftEssences(options, query), [options, query]);

  useEffect(() => {
    if (selected) setQuery(craftEssenceLabel(selected));
  }, [selected]);

  useEffect(() => {
    setActive((current) => (current < candidates.length ? current : -1));
  }, [candidates.length]);

  const confirm = (option?: CraftEssenceOption) => {
    setError(Boolean(query.trim()) && !option);
    if (!option) return;
    onChange({ ...policy, craftEssenceId: option.craftEssence.id });
    setQuery(craftEssenceLabel(option.craftEssence));
    setFocused(false);
    setActive(-1);
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm text-text-secondary">
        <span>{text('support.ce')}</span>
        <div className="relative">
          <input
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={focused && candidates.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
            disabled={disabled}
            placeholder={text('support.ce_placeholder')}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setFocused(true);
              setActive(-1);
              setError(false);
              if (!next.trim()) {
                onChange({ ...policy, craftEssenceId: undefined, craftEssenceMlb: undefined });
              } else if (options.length === 0) {
                void loadCatalog();
              }
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
                setActive(-1);
              }
            }}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-text-primary"
          />
          {focused && candidates.length > 0 && (
            <div
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-bg-primary p-1 shadow-lg"
            >
              {candidates.map((option, index) => (
                <button
                  key={option.craftEssence.id}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active === index}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => confirm(option)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    active === index ? 'bg-bg-hover' : 'hover:bg-bg-hover'
                  }`}
                >
                  <span className="truncate font-medium text-text-primary">
                    {option.craftEssence.name}
                  </span>
                  <span className="ml-3 shrink-0 text-text-muted">
                    #{option.craftEssence.collectionNo}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </label>

      {loading && <p className="text-xs text-text-muted">{text('support.ce_loading')}</p>}
      {error && <p className="text-xs text-warning">{text('support.ce_not_found')}</p>}

      {selected && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-primary px-3 py-2.5">
          <button
            type="button"
            disabled={disabled || downloading || Boolean(imageUrl)}
            onClick={async () => {
              setDownloading(true);
              setError(false);
              try {
                await downloadCraftEssenceImage('TW', selected.collectionNo ?? selected.id ?? 0);
                setImageVersion((version) => version + 1);
              } catch {
                setError(true);
              } finally {
                setDownloading(false);
              }
            }}
            className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-secondary text-text-muted"
            title={imageUrl ? undefined : text('support.ce_download')}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : downloading ? (
              <Download className="h-5 w-5 animate-pulse" />
            ) : (
              <Image className="h-6 w-6" />
            )}
          </button>
          <div className="min-w-0 flex-1 text-sm text-text-muted">#{selected.collectionNo}</div>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={Boolean(policy.craftEssenceMlb)}
              disabled={disabled}
              onChange={(event) => onChange({ ...policy, craftEssenceMlb: event.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            {text('support.ce_mlb')}
          </label>
        </div>
      )}
    </div>
  );
}

function useCraftEssenceFaceUrl(
  craftEssence: AtlasCraftEssenceEntry | undefined,
  version: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (craftEssence) {
      void readCachedCraftEssenceFace('TW', craftEssence).then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        setUrl(objectUrl);
      });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [craftEssence, version]);

  return url;
}
