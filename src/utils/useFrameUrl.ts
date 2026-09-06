import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 实时截图帧的 URL 管理。
 *
 * 后端 `maa_get_cached_image` 返回的是整帧的 base64 data URL。直接把它交给
 * `<img src>` 会让 WebKit 把每一帧都当成一个**新资源**缓存：data URL 逐帧不同，
 * 缓存键就逐帧不同，而一张 1920x1080 解码后的位图是 8.3MB。按 1fps 连续跑，
 * 回收速度远跟不上写入，WebContent 进程会涨到 GB 级。
 *
 * 这里把每帧转成 object URL 并撤销上一帧，任何时刻只留一份图片资源，
 * 内存占用与运行时长无关。调用签名与 `useState<string | null>` 一致，
 * 现有调用点无需改动。
 */
export function useFrameUrl(): [string | null, (frame: string | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);

  const revokeCurrent = useCallback(() => {
    if (currentRef.current) {
      URL.revokeObjectURL(currentRef.current);
      currentRef.current = null;
    }
  }, []);

  const setFrame = useCallback(
    (frame: string | null) => {
      const next = frame ? dataUrlToObjectUrl(frame) : null;
      revokeCurrent();
      currentRef.current = next;
      // 转换失败（非 base64 data URL）时退回原始字符串，行为与改动前一致
      setUrl(next ?? frame);
    },
    [revokeCurrent],
  );

  // 组件卸载时释放最后一帧
  useEffect(() => revokeCurrent, [revokeCurrent]);

  return [url, setFrame];
}

/** 把 base64 data URL 解成 Blob；无法解析时返回 null。 */
export function decodeDataUrl(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) return null;

  const header = dataUrl.slice(5, comma);
  if (!header.includes(';base64')) return null;
  const mime = header.slice(0, header.indexOf(';')) || 'image/png';

  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** 把 base64 data URL 转成 object URL；无法解析时返回 null。 */
function dataUrlToObjectUrl(dataUrl: string): string | null {
  const blob = decodeDataUrl(dataUrl);
  return blob ? URL.createObjectURL(blob) : null;
}
