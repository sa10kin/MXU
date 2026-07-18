import type { AtlasBasicServantEntry, AtlasServer } from '../atlas/atlasService';
import { loadAtlasAliases } from '../atlas/atlasAliases';

export interface SupportServantOption {
  servant: AtlasBasicServantEntry;
  aliases: string[];
}

export function mergeSupportServants(
  catalogs: Partial<Record<AtlasServer, AtlasBasicServantEntry[]>>,
  displayServer: AtlasServer = 'TW',
  savedAliases: Record<string, string[]> = loadAtlasAliases().servants,
): SupportServantOption[] {
  const merged = new Map<number, SupportServantOption>();

  for (const entries of Object.values(catalogs)) {
    for (const entry of entries ?? []) {
      if (!entry.id) continue;
      const current = merged.get(entry.id) ?? { servant: entry, aliases: [] };
      const aliasKey = String(entry.collectionNo ?? entry.id);
      current.aliases.push(...servantNames(entry), ...(savedAliases[aliasKey] ?? []));
      merged.set(entry.id, current);
    }
  }

  for (const entry of catalogs[displayServer] ?? []) {
    if (entry.id && merged.has(entry.id)) merged.get(entry.id)!.servant = entry;
  }

  return [...merged.values()]
    .map((option) => ({ ...option, aliases: [...new Set(option.aliases)] }))
    .sort((left, right) => (left.servant.collectionNo ?? 0) - (right.servant.collectionNo ?? 0));
}

export function servantLabel(servant: AtlasBasicServantEntry): string {
  return `${servant.name} #${servant.collectionNo}`;
}

export function resolveSupportServant(
  options: SupportServantOption[],
  input: string,
): SupportServantOption | undefined {
  const query = normalize(input);
  const exact = options.find(
    ({ servant, aliases }) =>
      normalize(servantLabel(servant)) === query ||
      aliases.some((alias) => normalize(alias) === query) ||
      String(servant.collectionNo) === query ||
      String(servant.id) === query,
  );
  if (exact || !query || /^\d+$/.test(query)) return exact;

  const partial = options.filter(({ aliases }) =>
    aliases.some((alias) => normalize(alias).includes(query)),
  );
  return partial.length === 1 ? partial[0] : undefined;
}

export function filterSupportServants(
  options: SupportServantOption[],
  input: string,
  limit = 8,
): SupportServantOption[] {
  const query = normalize(input);
  if (!query) return [];

  return options
    .filter(({ servant, aliases }) =>
      /^\d+$/.test(query)
        ? String(servant.collectionNo).startsWith(query) || String(servant.id).startsWith(query)
        : aliases.some((alias) => normalize(alias).includes(query)),
    )
    .slice(0, limit);
}

function servantNames(servant: AtlasBasicServantEntry): string[] {
  return [
    servant.name,
    servant.originalName,
    servant.nameCn,
    servant.nameTw,
    servant.nameJp,
  ].filter((name): name is string => Boolean(name));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
