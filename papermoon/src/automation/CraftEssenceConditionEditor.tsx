import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  CHINESE_ATLAS_SERVERS,
  ensureCraftEssences,
  getCraftEssences,
  type AtlasServer,
} from '../atlas/atlasService';
import {
  filterCraftEssences,
  mergeCraftEssenceOptions,
  resolveCraftEssence,
  type CraftEssenceOption,
} from './craftEssenceSearch';
import {
  supportCraftEssences,
  withSupportCraftEssences,
  type SupportPolicy,
} from './supportPolicy';

export function CraftEssenceConditionEditor({
  scopeServer,
  displayServer,
  policy,
  disabled,
  text,
  onChange,
}: {
  scopeServer: AtlasServer;
  displayServer: AtlasServer;
  policy: SupportPolicy;
  disabled: boolean;
  text: (key: string) => string;
  onChange: (policy: SupportPolicy) => void;
}) {
  const selectedFilters = supportCraftEssences(policy);
  const [options, setOptions] = useState<CraftEssenceOption[]>([]);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    let mounted = true;
    setOptions([]);
    void Promise.all(
      CHINESE_ATLAS_SERVERS.map(
        async (server) => [server, await getCraftEssences(server)] as const,
      ),
    ).then((entries) => {
      if (mounted) {
        setOptions(
          mergeCraftEssenceOptions(Object.fromEntries(entries), scopeServer, displayServer),
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, [displayServer, scopeServer]);

  const loadCatalog = async () => {
    if (loadingRef.current || options.length > 0) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const entries = await Promise.all(
        CHINESE_ATLAS_SERVERS.map(
          async (server) => [server, await ensureCraftEssences(server)] as const,
        ),
      );
      setOptions(mergeCraftEssenceOptions(Object.fromEntries(entries), scopeServer, displayServer));
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const candidates = useMemo(
    () =>
      filterCraftEssences(options, query).filter(
        ({ craftEssence }) => !selectedFilters.some(({ id }) => id === craftEssence.id),
      ),
    [options, query, selectedFilters],
  );

  useEffect(() => {
    setActive((current) => (current < candidates.length ? current : -1));
  }, [candidates.length]);

  const confirm = (option?: CraftEssenceOption) => {
    setError(Boolean(query.trim()) && !option);
    const id = option?.craftEssence.id;
    if (!id) return;
    onChange(withSupportCraftEssences(policy, [...selectedFilters, { id }]));
    setQuery('');
    setFocused(false);
    setActive(-1);
  };

  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm text-text-secondary">
        <span>{text('support.ce_pool')}</span>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              value={query}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={focused && candidates.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
              disabled={disabled}
              placeholder={text('support.ce_pool_placeholder')}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                setFocused(true);
                setActive(-1);
                setError(false);
                if (next.trim() && options.length === 0) {
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
          <button
            type="button"
            disabled={disabled || !query.trim()}
            onClick={() => confirm(resolveCraftEssence(options, query))}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm text-accent disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {text('support.ce_pool_add')}
          </button>
        </div>
      </label>

      <p className="text-xs text-text-muted">
        {text(
          policy.servantType === 'grand'
            ? 'support.ce_pool_grand_hint'
            : 'support.ce_pool_normal_hint',
        )}
      </p>

      {loading && <p className="text-xs text-text-muted">{text('support.ce_loading')}</p>}
      {error && <p className="text-xs text-warning">{text('support.ce_not_found')}</p>}

      {selectedFilters.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-muted">
          {text('support.ce_pool_empty')}
        </p>
      )}
      {selectedFilters.map((filter) => {
        const selected = options.find(
          ({ craftEssence }) => craftEssence.id === filter.id,
        )?.craftEssence;
        return (
          <div
            key={filter.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-primary px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-text-primary">
                {selected?.name ?? `#${filter.id}`}
              </div>
              <div className="text-xs text-text-muted">#{selected?.collectionNo ?? filter.id}</div>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={Boolean(filter.mlb)}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    withSupportCraftEssences(
                      policy,
                      selectedFilters.map((item) =>
                        item.id === filter.id
                          ? { ...item, mlb: event.target.checked || undefined }
                          : item,
                      ),
                    ),
                  )
                }
                className="h-4 w-4 accent-accent"
              />
              {text('support.ce_mlb')}
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  withSupportCraftEssences(
                    policy,
                    selectedFilters.filter(({ id }) => id !== filter.id),
                  ),
                )
              }
              className="rounded-md p-2 text-danger hover:bg-danger/10 disabled:opacity-40"
              title={text('support.ce_remove')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
