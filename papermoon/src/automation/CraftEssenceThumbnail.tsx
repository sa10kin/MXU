import { useEffect, useState } from 'react';
import { Download, Image } from 'lucide-react';

import {
  downloadCraftEssenceImage,
  readCachedCraftEssenceFace,
  type AtlasCraftEssenceEntry,
  type AtlasServer,
} from '../atlas/atlasService';

export function useCraftEssenceImage(
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

// 礼装素材按需缓存：缓存命中显示卡面，未命中显示占位图，点击占位图才下载。
// 任务预检只报告缺失并阻止开始，因此每个能选礼装的位置都必须给出这个入口。
export function CraftEssenceThumbnail({
  scopeServer,
  craftEssence,
  disabled,
  className = 'h-10 w-16',
  title,
  onDownloaded,
  onError,
}: {
  scopeServer: AtlasServer;
  craftEssence?: AtlasCraftEssenceEntry;
  disabled: boolean;
  className?: string;
  title?: string;
  onDownloaded?: () => void;
  onError?: (failed: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const imageUrl = useCraftEssenceImage(scopeServer, craftEssence, version);

  return (
    <button
      type="button"
      disabled={disabled || !craftEssence || downloading || Boolean(imageUrl)}
      title={craftEssence && !imageUrl ? title : undefined}
      onClick={async () => {
        if (!craftEssence) return;
        setDownloading(true);
        setFailed(false);
        onError?.(false);
        try {
          await downloadCraftEssenceImage(
            scopeServer,
            craftEssence.collectionNo ?? craftEssence.id ?? 0,
          );
          setVersion((current) => current + 1);
          onDownloaded?.();
        } catch {
          setFailed(true);
          onError?.(true);
        } finally {
          setDownloading(false);
        }
      }}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-primary ${
        failed ? 'text-danger' : 'text-text-muted'
      } ${className}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : downloading ? (
        <Download className="h-4 w-4 animate-pulse" />
      ) : (
        <Image className="h-5 w-5" />
      )}
    </button>
  );
}
