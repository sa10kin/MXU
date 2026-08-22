import type { AtlasCraftEssenceEntry, AtlasServer } from '../atlas/atlasService';

export interface CraftEssenceOption {
  craftEssence: AtlasCraftEssenceEntry;
  aliases: string[];
}

export function buildCraftEssenceOptions(entries: AtlasCraftEssenceEntry[]): CraftEssenceOption[] {
  return entries
    .filter((entry) => entry.id && entry.collectionNo)
    .map((craftEssence) => ({
      craftEssence,
      aliases: [craftEssence.name, craftEssence.nameCn, craftEssence.nameTw].filter(
        (name): name is string => Boolean(name),
      ),
    }));
}

export function mergeCraftEssenceOptions(
  catalogs: Partial<Record<AtlasServer, AtlasCraftEssenceEntry[]>>,
  scopeServer: AtlasServer,
  displayServer: AtlasServer,
): CraftEssenceOption[] {
  const names = new Map(
    (catalogs[displayServer] ?? [])
      .filter((entry) => entry.id)
      .map((entry) => [entry.id, entry.name]),
  );
  const cnNames = new Map(
    (catalogs.CN ?? []).filter((entry) => entry.id).map((entry) => [entry.id, entry.name]),
  );
  const twNames = new Map(
    (catalogs.TW ?? []).filter((entry) => entry.id).map((entry) => [entry.id, entry.name]),
  );
  return buildCraftEssenceOptions(
    (catalogs[scopeServer] ?? []).map((entry) => ({
      ...entry,
      name: names.get(entry.id) ?? entry.name,
      nameCn: cnNames.get(entry.id) ?? entry.nameCn,
      nameTw: twNames.get(entry.id) ?? entry.nameTw,
    })),
  );
}

export function craftEssenceLabel(entry: AtlasCraftEssenceEntry): string {
  return `${entry.name} #${entry.collectionNo}`;
}

export function filterCraftEssences(
  options: CraftEssenceOption[],
  input: string,
  limit = 8,
): CraftEssenceOption[] {
  const query = normalize(input);
  if (!query) return [];
  return options
    .filter(({ craftEssence, aliases }) =>
      /^\d+$/.test(query)
        ? String(craftEssence.collectionNo).startsWith(query) ||
          String(craftEssence.id).startsWith(query)
        : aliases.some((alias) => normalize(alias).includes(query)),
    )
    .slice(0, limit);
}

export function resolveCraftEssence(
  options: CraftEssenceOption[],
  input: string,
): CraftEssenceOption | undefined {
  const query = normalize(input);
  const exact = options.find(
    ({ craftEssence, aliases }) =>
      normalize(craftEssenceLabel(craftEssence)) === query ||
      aliases.some((alias) => normalize(alias) === query) ||
      String(craftEssence.collectionNo) === query ||
      String(craftEssence.id) === query,
  );
  if (exact || !query || /^\d+$/.test(query)) return exact;
  const partial = filterCraftEssences(options, input, options.length);
  return partial.length === 1 ? partial[0] : undefined;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
