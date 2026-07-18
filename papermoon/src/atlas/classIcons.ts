/**
 * 职阶图标本地缓存。图标是通用小资源，不针对具体从者，因此存放在
 * `cache/static/class_icons/`——位于 Atlas 所有权范围（`cache/atlas`）之外，
 * 「重建 Atlas 缓存」不会删除它们。首次显示时下载一次，之后离线可用；
 * 任何一步失败都回退到远程 URL，行为不劣于热链。
 */
import { getCacheDir, isTauri, joinPath } from '@/utils/paths';

const iconSrcCache = new Map<string, Promise<string>>();

export function classIconRemoteUrl(iconId: number, active: boolean): string {
  return `https://static.atlasacademy.io/JP/ClassIcons/class${active ? 3 : 2}_${iconId}.png`;
}

export function resolveClassIconSrc(iconId: number, active: boolean): Promise<string> {
  const key = `class${active ? 3 : 2}_${iconId}`;
  let pending = iconSrcCache.get(key);
  if (!pending) {
    pending = loadClassIcon(key, classIconRemoteUrl(iconId, active)).catch(() =>
      classIconRemoteUrl(iconId, active),
    );
    iconSrcCache.set(key, pending);
  }
  return pending;
}

async function loadClassIcon(key: string, remoteUrl: string): Promise<string> {
  if (!isTauri()) return remoteUrl;
  const dir = await joinPath(await getCacheDir(), 'static', 'class_icons');
  const path = await joinPath(dir, `${key}.png`);
  const { exists, mkdir, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
  let bytes: Uint8Array;
  if (await exists(path)) {
    bytes = await readFile(path);
  } else {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const response = await tauriFetch(remoteUrl);
    if (!response.ok) {
      throw new Error(`download class icon ${key}: HTTP ${response.status}`);
    }
    bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(dir, { recursive: true });
    await writeFile(path, bytes);
  }
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}
