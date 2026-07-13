import { invoke } from '@tauri-apps/api/core';
import { loggers } from '@/utils/logger';
import { getCacheDir, isTauri, joinPath } from '@/utils/paths';

export type AtlasServer = 'TW' | 'CN' | 'JP';
export type AtlasDataset = 'servants' | 'craftEssences' | 'mysticCodes';

export interface AtlasDatasetStatus {
  dataset: AtlasDataset;
  available: boolean;
  count: number;
  updatedAt?: number;
  path: string;
  error?: string;
}

export interface AtlasCacheStatus {
  server: AtlasServer;
  cacheDir: string;
  datasets: Record<AtlasDataset, AtlasDatasetStatus>;
}

export interface AtlasDownloadResult extends AtlasDatasetStatus {
  server: AtlasServer;
  fromUrl: string;
}

export interface AtlasNameDownloadResult {
  server: AtlasServer;
  ok: boolean;
  error?: string;
}

export interface AtlasBasicServantStatus {
  server: AtlasServer;
  available: boolean;
  count: number;
  updatedAt?: number;
  path: string;
  error?: string;
}

interface AtlasBasicServantEntry extends AtlasServantEntry {
  face?: string;
}

interface AtlasBasicServantIndex {
  generatedAt?: number;
  servants?: AtlasBasicServantEntry[];
}

export interface AtlasImageEntry {
  url: string;
  save_path: string;
}

export interface AtlasImageDownloadResult {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface AtlasImageProgressEvent {
  downloaded: number;
  skipped: number;
  total: number;
  failed: number;
}

export interface AtlasImageStatus {
  available: boolean;
  total: number;
  downloaded: number;
  dir: string;
}

export interface AtlasAssetIndex {
  kind: string;
  variant: string;
  url: string;
}

export interface AtlasCatalogEntry {
  id?: number;
  collectionNo?: number;
  name: string;
  originalName?: string;
  nameCn?: string;
  nameTw?: string;
  nameJp?: string;
  assets?: Record<string, AtlasAssetIndex[]> | AtlasAssetIndex[];
}

export interface AtlasServantEntry extends AtlasCatalogEntry {
  className?: string;
  rarity?: number;
}

export interface AtlasCraftEssenceEntry extends AtlasCatalogEntry {
  rarity?: number;
  cost?: number;
}

export interface AtlasMysticCodeEntry extends AtlasCatalogEntry {
  shortName?: string;
}

const log = loggers.app;
const ATLAS_API_BASE = 'https://api.atlasacademy.io';
const ATLAS_FETCH_TIMEOUT_MS = 20_000;
const ATLAS_FETCH_RETRIES = 2;
const BASIC_SERVANTS_INDEX_FILE = 'basic_servants.json';

const INDEX_FILES: Record<AtlasDataset, string> = {
  servants: 'servants.index.json',
  craftEssences: 'craft_essences.index.json',
  mysticCodes: 'mystic_codes.index.json',
};

const INDEX_KEYS: Record<AtlasDataset, 'servants' | 'craftEssences' | 'mysticCodes'> = {
  servants: 'servants',
  craftEssences: 'craftEssences',
  mysticCodes: 'mysticCodes',
};

const EXPORT_FILES: Record<AtlasDataset, string> = {
  servants: 'nice_servant.json',
  craftEssences: 'nice_equip.json',
  mysticCodes: 'nice_mystic_code.json',
};

export const ATLAS_SERVERS: AtlasServer[] = ['TW', 'CN', 'JP'];
export const ATLAS_DATASETS: AtlasDataset[] = ['servants', 'craftEssences', 'mysticCodes'];

export function atlasServerFromFgoClient(caseName?: string): AtlasServer {
  const normalized = caseName?.toUpperCase();
  if (normalized === 'CN') return 'CN';
  if (normalized === 'JP') return 'JP';
  return 'TW';
}

export async function getAtlasCacheDir(server: AtlasServer): Promise<string> {
  const cacheDir = await getCacheDir();
  return joinPath(cacheDir, 'atlas', server);
}

export async function getAtlasCatalogDir(server: AtlasServer): Promise<string> {
  const cacheDir = await getCacheDir();
  return joinPath(cacheDir, 'atlas', 'catalog', server);
}

export async function getAtlasServantAssetDir(kind: 'faces'): Promise<string> {
  const cacheDir = await getCacheDir();
  return joinPath(cacheDir, 'atlas', 'assets', 'servants', kind);
}

export async function getAtlasImageDir(
  server: AtlasServer,
  dataset?: AtlasDataset,
): Promise<string> {
  const cacheDir = await getAtlasCacheDir(server);
  const imgDir = await joinPath(cacheDir, 'images');
  return dataset ? joinPath(imgDir, dataset) : imgDir;
}

function indexPath(cacheDir: string, dataset: AtlasDataset) {
  return joinPath(cacheDir, INDEX_FILES[dataset]);
}

function servantNamesIndexPath(cacheDir: string) {
  return joinPath(cacheDir, BASIC_SERVANTS_INDEX_FILE);
}

function manifestPath(cacheDir: string) {
  return joinPath(cacheDir, 'manifest.json');
}

function exportUrl(server: AtlasServer, dataset: AtlasDataset) {
  return `${ATLAS_API_BASE}/export/${server}/${EXPORT_FILES[dataset]}`;
}

function servantNamesUrl(server: AtlasServer) {
  return `${ATLAS_API_BASE}/export/${server}/basic_servant.json`;
}

export async function getAtlasCacheStatus(server: AtlasServer): Promise<AtlasCacheStatus> {
  const cacheDir = await getAtlasCacheDir(server);
  const entries = await Promise.all(
    ATLAS_DATASETS.map(async (dataset) => [dataset, await readDatasetStatus(cacheDir, dataset)]),
  );
  return {
    server,
    cacheDir,
    datasets: Object.fromEntries(entries) as Record<AtlasDataset, AtlasDatasetStatus>,
  };
}

export function missingAtlasDatasets(status: AtlasCacheStatus): AtlasDataset[] {
  return ATLAS_DATASETS.filter((dataset) => !status.datasets[dataset]?.available);
}

export async function downloadAtlasDataset(
  server: AtlasServer,
  dataset: AtlasDataset,
): Promise<AtlasDownloadResult> {
  if (!isTauri()) {
    throw new Error('Atlas cache download is only available in the desktop app.');
  }

  const cacheDir = await getAtlasCacheDir(server);
  const url = exportUrl(server, dataset);
  const payload = await fetchAtlasJson(url);
  if (!Array.isArray(payload)) {
    throw new Error(`Atlas export has unexpected shape: ${url}`);
  }

  const index = buildIndex(dataset, payload, server);
  const updatedAt = Date.now();
  const metadata = {
    server,
    dataset,
    sourceUrl: url,
    updatedAt,
    count: payload.length,
  };

  await writeAtlasIndexAtomically(cacheDir, dataset, metadata, index);
  const status = await readDatasetStatus(cacheDir, dataset);
  return {
    ...status,
    server,
    fromUrl: url,
  };
}

// Cross-language search needs the servant *name* index for every server, not
// just the selected one. Names only (no images), keyed by the shared global id.
export async function downloadServantNamesAllServers(
  onServerDone?: (server: AtlasServer) => void,
): Promise<AtlasNameDownloadResult[]> {
  const results: AtlasNameDownloadResult[] = [];

  for (const server of ATLAS_SERVERS) {
    try {
      await downloadServantNames(server);
      onServerDone?.(server);
      results.push({ server, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`Atlas ${server} servant names download failed.`, err);
      results.push({ server, ok: false, error: message });
    }
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(
      `Atlas servant name download failed: ${failures
        .map((result) => `${result.server}: ${result.error ?? 'unknown error'}`)
        .join('; ')}`,
    );
  }

  return results;
}

export async function hasServantNames(server: AtlasServer): Promise<boolean> {
  return (await readServantNamesIndex(server, false)) !== null;
}

/**
 * basic_servant is the per-server catalogue index. Its face URLs seed the
 * shared avatar cache used by servant selection; it does not fetch battle
 * recognition assets or craft essence data.
 */
export async function getBasicServantStatus(
  server: AtlasServer = 'TW',
): Promise<AtlasBasicServantStatus> {
  const catalogDir = await getAtlasCatalogDir(server);
  const path = servantNamesIndexPath(catalogDir);
  if (!isTauri()) return { server, available: false, count: 0, path };

  try {
    const index = await readServantNamesIndex(server, false);
    const servants = Array.isArray(index?.servants) ? index.servants : [];
    return {
      server,
      available: index !== null,
      count: servants.length,
      updatedAt: typeof index?.generatedAt === 'number' ? index.generatedAt : undefined,
      path,
    };
  } catch (error) {
    return {
      server,
      available: false,
      count: 0,
      path,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Download or refresh a server catalogue and its shared servant face images. */
export async function downloadBasicServantData(
  server: AtlasServer = 'TW',
): Promise<AtlasBasicServantStatus> {
  await downloadServantNames(server);
  await downloadBasicServantFaces(server);
  return getBasicServantStatus(server);
}

/**
 * Remove every Atlas catalogue and asset cache. This intentionally leaves the
 * cache empty; downloading is a separate explicit action after UI consent.
 */
export async function rebuildAtlasCache(
): Promise<void> {
  if (!isTauri()) {
    throw new Error('Atlas cache rebuild is only available in the desktop app.');
  }

  const cacheDir = await getCacheDir();
  const atlasDir = await joinPath(cacheDir, 'atlas');
  const { exists, remove } = await import('@tauri-apps/plugin-fs');
  if (await exists(atlasDir)) {
    await remove(atlasDir, { recursive: true });
  }
}

export async function downloadBasicServantFaces(
  server: AtlasServer,
): Promise<AtlasImageDownloadResult> {
  if (!isTauri()) {
    throw new Error('Atlas image download is only available in the desktop app.');
  }

  const index = await readServantNamesIndex(server, false);
  const imageList = buildBasicServantFaceDownloadList(index, await getAtlasServantAssetDir('faces'));
  if (imageList.length === 0) {
    return { total: 0, downloaded: 0, skipped: 0, failed: 0, errors: [] };
  }

  return invoke('download_atlas_images', { imageList, concurrency: 6 });
}

export async function getAtlasImageStatus(
  server: AtlasServer,
  dataset: AtlasDataset,
): Promise<AtlasImageStatus> {
  const cacheDir = await getAtlasCacheDir(server);
  const imgDir = await getAtlasImageDir(server, dataset);
  if (!isTauri()) {
    return { available: false, total: 0, downloaded: 0, dir: imgDir };
  }

  try {
    const { exists, readDir } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(imgDir))) {
      return { available: false, total: 0, downloaded: 0, dir: imgDir };
    }

    // Read the dataset's index to get total required
    const status = await readDatasetStatus(cacheDir, dataset);
    if (!status.available) {
      return { available: false, total: 0, downloaded: 0, dir: imgDir };
    }

    const idxPath = indexPath(cacheDir, dataset);
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const indexStr = await readTextFile(idxPath);
    const indexData = JSON.parse(indexStr);

    const list = collectImageDownloadList(indexData, dataset, imgDir);
    const total = list.length;

    // Count files in the imgDir that belong to this dataset
    const expectedNames = new Set(
      list.map((entry) => entry.save_path.split('/').pop() || entry.save_path.split('\\').pop()),
    );
    const entries = await readDir(imgDir);
    const downloaded = entries.filter(
      (entry) => !entry.isDirectory && entry.name && expectedNames.has(entry.name),
    ).length;

    return {
      available: downloaded > 0,
      total,
      downloaded,
      dir: imgDir,
    };
  } catch {
    return { available: false, total: 0, downloaded: 0, dir: imgDir };
  }
}

export async function downloadAtlasImages(
  server: AtlasServer,
  dataset: AtlasDataset,
): Promise<AtlasImageDownloadResult> {
  if (!isTauri()) {
    throw new Error('Atlas image download is only available in the desktop app.');
  }

  const cacheDir = await getAtlasCacheDir(server);
  const imgDir = await getAtlasImageDir(server, dataset);

  const status = await readDatasetStatus(cacheDir, dataset);
  if (!status.available) {
    throw new Error(`Atlas ${dataset} data not downloaded yet.`);
  }

  const idxPath = indexPath(cacheDir, dataset);
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const indexStr = await readTextFile(idxPath);
  const indexData = JSON.parse(indexStr);

  const imageList = collectImageDownloadList(indexData, dataset, imgDir);
  if (imageList.length === 0) {
    return { total: 0, downloaded: 0, skipped: 0, failed: 0, errors: [] };
  }

  return await invoke('download_atlas_images', { imageList, concurrency: 6 });
}

export async function downloadCraftEssenceImage(
  server: AtlasServer,
  craftEssenceNo: number,
): Promise<AtlasImageDownloadResult> {
  if (!isTauri()) {
    throw new Error('Atlas image download is only available in the desktop app.');
  }

  const imgDir = await getAtlasImageDir(server, 'craftEssences');
  const indexData = await readIndex(server, 'craftEssences');
  if (!indexData?.craftEssences) {
    throw new Error(`Atlas ${server} craft essence data is not downloaded yet.`);
  }
  const craftEssence = indexData?.craftEssences?.find((item: AtlasCraftEssenceEntry) =>
    matchesCraftEssenceIdentifier(item, craftEssenceNo),
  );
  if (!craftEssence) {
    throw new Error(`Craft essence ${craftEssenceNo} was not found in Atlas ${server}.`);
  }

  const imageList = selectCraftEssenceImageEntries(craftEssence, imgDir);
  if (imageList.length === 0) {
    throw new Error(`Craft essence ${craftEssenceNo} has no downloadable image asset.`);
  }

  return await invoke('download_atlas_images', { imageList, concurrency: 2 });
}

export async function cancelAtlasImageDownload() {
  if (isTauri()) {
    await invoke('cancel_atlas_images');
  }
}

export async function clearAtlasImageCache(
  server: AtlasServer,
  dataset?: AtlasDataset,
): Promise<void> {
  if (!isTauri()) return;
  const dir = await getAtlasImageDir(server, dataset);
  const { exists, remove } = await import('@tauri-apps/plugin-fs');
  if (await exists(dir)) {
    await remove(dir, { recursive: true });
  }
}

export async function rebuildAtlasImages(
  server: AtlasServer,
  dataset: AtlasDataset,
): Promise<AtlasImageDownloadResult> {
  await clearAtlasImageCache(server, dataset);
  return downloadAtlasImages(server, dataset);
}

export async function deleteCraftEssenceImages(
  server: AtlasServer,
  craftEssenceId: number,
): Promise<number> {
  if (!isTauri()) return 0;
  const imgDir = await getAtlasImageDir(server, 'craftEssences');
  const { exists, readDir, remove } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(imgDir))) return 0;
  const prefix = `${craftEssenceId}_`;
  const entries = await readDir(imgDir);
  let deleted = 0;
  for (const entry of entries) {
    if (entry.isDirectory || !entry.name || !entry.name.startsWith(prefix)) continue;
    await remove(await joinPath(imgDir, entry.name));
    deleted += 1;
  }
  return deleted;
}

export async function getAtlasBrowserData(server: AtlasServer) {
  const imgDir = await getAtlasImageDir(server);
  const servantsIndex = await readIndex(server, 'servants');
  const craftEssencesIndex = await readIndex(server, 'craftEssences');
  const mysticCodesIndex = await readIndex(server, 'mysticCodes');

  return {
    imgDir,
    imageDirs: {
      servants: await getAtlasImageDir(server, 'servants'),
      craftEssences: await getAtlasImageDir(server, 'craftEssences'),
      mysticCodes: await getAtlasImageDir(server, 'mysticCodes'),
    } satisfies Record<AtlasDataset, string>,
    servants: await enrichLocalizedNames(server, 'servants', servantsIndex?.servants || []),
    craftEssences: await enrichLocalizedNames(
      server,
      'craftEssences',
      craftEssencesIndex?.craftEssences || [],
    ),
    mysticCodes: mysticCodesIndex?.mysticCodes || [],
  };
}

async function readIndex(server: AtlasServer, dataset: AtlasDataset) {
  const cacheDir = await getAtlasCacheDir(server);
  const idxPath = indexPath(cacheDir, dataset);
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(idxPath))) return null;
  try {
    const indexStr = await readTextFile(idxPath);
    return JSON.parse(indexStr);
  } catch {
    return null;
  }
}

async function readServantNamesIndex(server: AtlasServer, allowFallback = true) {
  const [catalogDir, legacyCacheDir] = await Promise.all([
    getAtlasCatalogDir(server),
    getAtlasCacheDir(server),
  ]);
  const namesPath = servantNamesIndexPath(catalogDir);
  const legacyNamesPath = joinPath(legacyCacheDir, 'servant_names.index.json');
  const fallbackPath = indexPath(legacyCacheDir, 'servants');
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
  const path = (await exists(namesPath))
    ? namesPath
    : (await exists(legacyNamesPath))
      ? legacyNamesPath
      : allowFallback
        ? fallbackPath
        : namesPath;
  if (!(await exists(path))) return null;
  try {
    return JSON.parse(await readTextFile(path));
  } catch {
    return null;
  }
}

async function enrichLocalizedNames<T extends AtlasCatalogEntry>(
  server: AtlasServer,
  dataset: 'servants' | 'craftEssences',
  entries: T[],
): Promise<T[]> {
  const [cnIndex, twIndex, jpIndex] = await Promise.all([
    server === 'CN'
      ? Promise.resolve(null)
      : dataset === 'servants'
        ? readServantNamesIndex('CN')
        : readIndex('CN', dataset),
    server === 'TW'
      ? Promise.resolve(null)
      : dataset === 'servants'
        ? readServantNamesIndex('TW')
        : readIndex('TW', dataset),
    server === 'JP'
      ? Promise.resolve(null)
      : dataset === 'servants'
        ? readServantNamesIndex('JP')
        : readIndex('JP', dataset),
  ]);
  const key = dataset === 'servants' ? 'servants' : 'craftEssences';
  const cnMap = buildLocalizedNameMap(cnIndex?.[key] || []);
  const twMap = buildLocalizedNameMap(twIndex?.[key] || []);
  const jpMap = buildLocalizedNameMap(jpIndex?.[key] || []);
  return entries.map((entry) => {
    const lookupKey = catalogLookupKey(entry);
    return {
      ...entry,
      nameCn: entry.nameCn || cnMap.get(lookupKey),
      nameTw: entry.nameTw || twMap.get(lookupKey),
      nameJp: entry.nameJp || jpMap.get(lookupKey),
    };
  });
}

function buildLocalizedNameMap(entries: AtlasCatalogEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of entries) {
    const key = catalogLookupKey(entry);
    if (key && entry.name) result.set(key, entry.name);
  }
  return result;
}

function catalogLookupKey(entry: AtlasCatalogEntry): string {
  return String(entry.collectionNo || entry.id || '');
}

async function downloadServantNames(server: AtlasServer): Promise<void> {
  const catalogDir = await getAtlasCatalogDir(server);
  if (isTauri()) {
    await invoke('download_atlas_servant_names', { server });
    return;
  }

  const url = servantNamesUrl(server);
  const payload = await fetchAtlasJson(url);
  if (!Array.isArray(payload)) {
    throw new Error(`Atlas servant names export has unexpected shape: ${url}`);
  }

  const index = buildServantNameIndex(payload, server);
  await writeJsonFileAtomically(catalogDir, servantNamesIndexPath(catalogDir), index);
}

export function buildBasicServantFaceDownloadList(
  index: AtlasBasicServantIndex | null,
  imageDir: string,
): AtlasImageEntry[] {
  const entries = index?.servants ?? [];
  const seen = new Set<string>();
  const images: AtlasImageEntry[] = [];
  for (const servant of entries) {
    if (!servant.id || !servant.face) continue;
    const savePath = `${imageDir}/${servant.id}_face.png`;
    if (seen.has(savePath)) continue;
    seen.add(savePath);
    images.push({ url: servant.face, save_path: savePath });
  }
  return images;
}

function collectImageDownloadList(
  indexData: any,
  dataset: AtlasDataset,
  imgDir: string,
): AtlasImageEntry[] {
  const list: AtlasImageEntry[] = [];
  const appendFromAssets = (id: string, assets: Record<string, AtlasAssetIndex[]>) => {
    // Collect from specific scenes
    const scenes = ['team', 'battle', 'command', 'face', 'status'];
    for (const scene of scenes) {
      if (assets[scene]) {
        for (const asset of assets[scene]) {
          if (
            dataset === 'servants' &&
            !['faces', 'commands', 'status', 'commandNp', 'narrowFigure'].includes(asset.kind)
          ) {
            continue;
          }

          const fileName = atlasImageFileName(id, asset);
          list.push({
            url: asset.url,
            save_path: `${imgDir}/${fileName}`,
          });
        }
      }
    }
  };

  if (dataset === 'servants' && Array.isArray(indexData.servants)) {
    for (const servant of indexData.servants) {
      if (servant.assets) {
        appendFromAssets(String(servant.id), servant.assets);
      }
    }
  } else if (dataset === 'craftEssences' && Array.isArray(indexData.craftEssences)) {
    for (const ce of indexData.craftEssences) {
      const assets = Array.isArray(ce.assets) ? ce.assets : [];
      for (const asset of assets) {
        list.push({
          url: asset.url,
          save_path: `${imgDir}/${atlasImageFileName(String(ce.id), asset)}`,
        });
      }
    }
  } else if (dataset === 'mysticCodes' && Array.isArray(indexData.mysticCodes)) {
    for (const mc of indexData.mysticCodes) {
      if (mc.assets && Array.isArray(mc.assets)) {
        for (const asset of mc.assets) {
          list.push({
            url: asset.url,
            save_path: `${imgDir}/${atlasImageFileName(String(mc.id), asset)}`,
          });
        }
      }
    }
  }

  // Deduplicate by URL just in case
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function atlasImageFileName(id: string | number, asset: AtlasAssetIndex): string {
  return `${id}_${asset.kind}_${asset.variant.replace(/[/\\]/g, '-')}.png`;
}

function selectCraftEssenceImageEntries(
  craftEssence: AtlasCraftEssenceEntry,
  imgDir: string,
): AtlasImageEntry[] {
  const assets = Array.isArray(craftEssence.assets) ? craftEssence.assets : [];
  const imageAssets = assets.filter((asset) => asset.url);
  if (imageAssets.length === 0 || craftEssence.id === undefined) return [];

  const wanted = [
    selectCraftEssenceAsset(imageAssets, 'faces'),
    selectCraftEssenceAsset(imageAssets, 'equipFaces'),
  ].filter((asset): asset is AtlasAssetIndex => !!asset);
  return wanted.map((asset) => ({
    url: asset.url,
    save_path: `${imgDir}/${atlasImageFileName(String(craftEssence.id), asset)}`,
  }));
}

function matchesCraftEssenceIdentifier(
  craftEssence: AtlasCraftEssenceEntry,
  inputId: number,
): boolean {
  if (craftEssence.id === inputId || craftEssence.collectionNo === inputId) return true;
  const textId = String(inputId);
  return getAssetNumberTokens(craftEssence.assets).includes(textId);
}

export function getAssetNumberTokens(assets: AtlasCatalogEntry['assets'] | undefined): string[] {
  const result = new Set<string>();
  const push = (asset: AtlasAssetIndex) => {
    for (const value of [asset.kind, asset.variant, asset.url]) {
      for (const token of value.match(/\d+/g) ?? []) {
        result.add(token);
      }
    }
  };

  if (Array.isArray(assets)) {
    assets.forEach(push);
  } else if (assets) {
    Object.values(assets).forEach((list) => list.forEach(push));
  }
  return [...result];
}

async function fetchAtlasJson(url: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= ATLAS_FETCH_RETRIES + 1; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ATLAS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (err) {
      lastError = err;
      if (attempt <= ATLAS_FETCH_RETRIES) {
        log.warn(`Atlas request failed, retrying (${attempt}/${ATLAS_FETCH_RETRIES}): ${url}`, err);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Atlas request failed after ${ATLAS_FETCH_RETRIES + 1} attempts (${Math.round(
      ATLAS_FETCH_TIMEOUT_MS / 1000,
    )}s timeout): ${reason}`,
  );
}

async function readDatasetStatus(
  cacheDir: string,
  dataset: AtlasDataset,
): Promise<AtlasDatasetStatus> {
  const path = indexPath(cacheDir, dataset);
  if (!isTauri()) {
    return { dataset, available: false, count: 0, path };
  }

  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(path))) {
      return { dataset, available: false, count: 0, path };
    }

    const raw = JSON.parse(await readTextFile(path)) as {
      count?: number;
      updatedAt?: number;
      generatedAt?: number;
      servants?: unknown[];
      craftEssences?: unknown[];
      mysticCodes?: unknown[];
    };
    const entries = raw[INDEX_KEYS[dataset]];
    const count =
      typeof raw.count === 'number' ? raw.count : Array.isArray(entries) ? entries.length : 0;
    return {
      dataset,
      available: true,
      count,
      updatedAt: raw.updatedAt ?? raw.generatedAt,
      path,
    };
  } catch (err) {
    return {
      dataset,
      available: false,
      count: 0,
      path,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function writeAtlasIndexAtomically(
  cacheDir: string,
  dataset: AtlasDataset,
  metadata: { updatedAt?: number; count?: number },
  index: unknown,
) {
  const { exists, mkdir, rename, writeTextFile, remove, readTextFile } =
    await import('@tauri-apps/plugin-fs');
  if (!(await exists(cacheDir))) {
    await mkdir(cacheDir, { recursive: true });
  }

  const idxPath = indexPath(cacheDir, dataset);
  const idxTmp = `${idxPath}.tmp`;

  try {
    await writeTextFile(idxTmp, JSON.stringify(index, null, 2));
    await rename(idxTmp, idxPath);

    const manifestFile = manifestPath(cacheDir);
    const manifest = await readManifest(manifestFile, readTextFile);
    manifest.datasets[dataset] = {
      updatedAt: metadata.updatedAt ?? Date.now(),
      count: metadata.count ?? 0,
      indexFile: INDEX_FILES[dataset],
    };
    await writeTextFile(manifestFile, JSON.stringify(manifest, null, 2));
  } catch (err) {
    await remove(idxTmp).catch(() => {});
    log.warn('Atlas cache write failed; existing cache was left untouched.', err);
    throw err;
  }
}

async function writeJsonFileAtomically(cacheDir: string, path: string, data: unknown) {
  const { exists, mkdir, rename, writeTextFile, remove } = await import('@tauri-apps/plugin-fs');
  if (!(await exists(cacheDir))) {
    await mkdir(cacheDir, { recursive: true });
  }

  const tmp = `${path}.tmp`;
  try {
    await writeTextFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, path);
  } catch (err) {
    await remove(tmp).catch(() => {});
    throw err;
  }
}

async function readManifest(
  path: string,
  readTextFile: (path: string) => Promise<string>,
): Promise<{ version: string; datasets: Record<string, unknown> }> {
  try {
    return JSON.parse(await readTextFile(path)) as {
      version: string;
      datasets: Record<string, unknown>;
    };
  } catch {
    return { version: '1.0', datasets: {} };
  }
}

function buildIndex(dataset: AtlasDataset, payload: unknown[], server: AtlasServer) {
  if (dataset === 'servants') return buildServantIndex(payload, server);
  if (dataset === 'craftEssences') return buildCraftEssenceIndex(payload, server);
  return buildMysticCodeIndex(payload);
}

function buildServantIndex(payload: unknown[], server: AtlasServer) {
  return {
    generatedAt: Date.now(),
    recognitionScenes: ['team', 'battle', 'command', 'face', 'status'],
    servants: payload.filter(isRecord).map((item) => ({
      id: optionalNumber(item.id),
      collectionNo: optionalNumber(item.collectionNo),
      name: optionalString(item.name) || optionalString(item.originalName) || String(item.id ?? ''),
      originalName: optionalString(item.originalName),
      nameCn: server === 'CN' ? optionalString(item.name) : undefined,
      nameTw: server === 'TW' ? optionalString(item.name) : undefined,
      nameJp: server === 'JP' ? optionalString(item.name) : undefined,
      className: optionalString(item.className),
      rarity: optionalNumber(item.rarity),
      assets: {
        team: collectServantSceneAssets(item, ['faces', 'status']),
        battle: collectServantSceneAssets(item, ['charaGraph', 'narrowFigure']),
        command: collectServantSceneAssets(item, ['commands']),
        face: collectServantSceneAssets(item, ['faces']),
        status: collectServantSceneAssets(item, ['status']),
      },
    })),
  };
}

function buildServantNameIndex(payload: unknown[], server: AtlasServer) {
  return {
    generatedAt: Date.now(),
    servants: payload.filter(isRecord).map((item) => ({
      id: optionalNumber(item.id),
      collectionNo: optionalNumber(item.collectionNo),
      name: optionalString(item.name) || optionalString(item.originalName) || String(item.id ?? ''),
      originalName: optionalString(item.originalName),
      nameCn: server === 'CN' ? optionalString(item.name) : undefined,
      nameTw: server === 'TW' ? optionalString(item.name) : undefined,
      nameJp: server === 'JP' ? optionalString(item.name) : undefined,
      className: optionalString(item.className),
      rarity: optionalNumber(item.rarity),
      face: optionalString(item.face),
    })),
  };
}

function buildCraftEssenceIndex(payload: unknown[], server: AtlasServer) {
  return {
    generatedAt: Date.now(),
    recognitionScenes: ['support', 'team'],
    craftEssences: payload.filter(isRecord).map((item) => ({
      id: optionalNumber(item.id),
      collectionNo: optionalNumber(item.collectionNo),
      name: optionalString(item.name) || optionalString(item.originalName) || String(item.id ?? ''),
      originalName: optionalString(item.originalName),
      nameCn: server === 'CN' ? optionalString(item.name) : undefined,
      nameTw: server === 'TW' ? optionalString(item.name) : undefined,
      rarity: optionalNumber(item.rarity),
      cost: optionalNumber(item.cost),
      assets: collectGenericAssets(item),
    })),
  };
}

function buildMysticCodeIndex(payload: unknown[]) {
  return {
    generatedAt: Date.now(),
    recognitionScenes: ['team'],
    mysticCodes: payload.filter(isRecord).map((item) => ({
      id: optionalNumber(item.id),
      name: optionalString(item.name) || optionalString(item.originalName) || String(item.id ?? ''),
      originalName: optionalString(item.originalName),
      shortName: optionalString(item.shortName),
      assets: collectGenericAssets(item),
    })),
  };
}

function collectServantSceneAssets(
  item: Record<string, unknown>,
  kinds: string[],
): AtlasAssetIndex[] {
  const extraAssets = asRecord(item.extraAssets);
  const assets: AtlasAssetIndex[] = [];
  for (const kind of kinds) {
    const group = asRecord(extraAssets?.[kind]);
    collectNestedAssets(assets, kind, group);
  }
  return dedupeAssets(assets);
}

function collectGenericAssets(item: Record<string, unknown>): AtlasAssetIndex[] {
  const assets: AtlasAssetIndex[] = [];
  const extraAssets = asRecord(item.extraAssets);
  if (extraAssets) {
    for (const [kind, value] of Object.entries(extraAssets)) {
      collectNestedAssets(assets, kind, asRecord(value));
    }
  }
  for (const kind of ['icon', 'image', 'maleImage', 'femaleImage']) {
    const url = item[kind];
    if (typeof url === 'string' && url.startsWith('http')) {
      assets.push({ kind, variant: 'default', url });
    }
  }
  return dedupeAssets(assets);
}

export function selectCraftEssenceAsset(
  assets: AtlasAssetIndex[],
  target: 'faces' | 'equipFaces',
): AtlasAssetIndex | undefined {
  const matches = assets.filter((asset) => {
    if (target === 'equipFaces') {
      return isCraftEssenceEquipFaceAsset(asset);
    }
    return isCraftEssenceFaceAsset(asset);
  });
  return matches.sort((a, b) => assetSortKey(a).localeCompare(assetSortKey(b)))[0];
}

export function isCraftEssenceFaceAsset(asset: AtlasAssetIndex): boolean {
  const text = `${asset.kind}/${asset.variant}/${asset.url}`.toLowerCase();
  return (
    (text.includes('/faces/') || text.includes('faces')) &&
    !text.includes('equipfaces') &&
    !text.includes('equip_faces')
  );
}

export function isCraftEssenceEquipFaceAsset(asset: AtlasAssetIndex): boolean {
  const text = `${asset.kind}/${asset.variant}/${asset.url}`.toLowerCase();
  return text.includes('equipfaces') || text.includes('equip_faces');
}

function assetSortKey(asset: AtlasAssetIndex): string {
  return `${asset.kind}/${asset.variant}/${asset.url}`;
}

function collectNestedAssets(
  assets: AtlasAssetIndex[],
  kind: string,
  value: Record<string, unknown> | undefined,
  prefix = '',
) {
  if (!value) return;
  for (const [key, child] of Object.entries(value)) {
    const variant = prefix ? `${prefix}/${key}` : key;
    if (typeof child === 'string' && child.startsWith('http')) {
      assets.push({ kind, variant, url: child });
    } else if (isRecord(child)) {
      collectNestedAssets(assets, kind, child, variant);
    }
  }
}

function dedupeAssets(assets: AtlasAssetIndex[]): AtlasAssetIndex[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.url)) return false;
    seen.add(asset.url);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
