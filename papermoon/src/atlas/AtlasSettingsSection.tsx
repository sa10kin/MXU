import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Database, RefreshCw } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { isTauri } from '@/utils/paths';

import {
  ATLAS_SERVERS,
  cancelAtlasImageDownload,
  downloadBasicServantData,
  downloadAllServantRecognitionAssets,
  getAtlasCatalogDir,
  getBasicServantStatus,
  getServantRecognitionStatus,
  rebuildAtlasCache,
  type AtlasBasicServantStatus,
  type AtlasImageDownloadResult,
  type AtlasImageProgressEvent,
  type AtlasServantRecognitionStatus,
  type AtlasServer,
} from './atlasService';

export function AtlasSettingsSection() {
  const { t } = useTranslation();
  const [server, setServer] = useState<AtlasServer>('TW');
  const [status, setStatus] = useState<AtlasBasicServantStatus | null>(null);
  const [recognitionStatus, setRecognitionStatus] = useState<AtlasServantRecognitionStatus | null>(
    null,
  );
  const [recognitionResult, setRecognitionResult] = useState<AtlasImageDownloadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [basicUpdating, setBasicUpdating] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [recognitionDownloading, setRecognitionDownloading] = useState(false);
  const [recognitionCancelling, setRecognitionCancelling] = useState(false);
  const [recognitionProgress, setRecognitionProgress] = useState<AtlasImageProgressEvent | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [cacheDir, setCacheDir] = useState('');
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);
  const [showRecognitionConfirm, setShowRecognitionConfirm] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextCacheDir, nextRecognitionStatus] = await Promise.all([
        getBasicServantStatus(server),
        getAtlasCatalogDir(server),
        getServantRecognitionStatus(server),
      ]);
      setStatus(nextStatus);
      setCacheDir(nextCacheDir);
      setRecognitionStatus(nextRecognitionStatus);
      if (nextStatus.error) setError(nextStatus.error);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [server]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<AtlasImageProgressEvent>('atlas-image-progress', (event) => {
      setRecognitionProgress(event.payload);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const updateBasicData = useCallback(async () => {
    setBasicUpdating(true);
    setError(null);
    try {
      setStatus(await downloadBasicServantData(server));
      setRecognitionStatus(await getServantRecognitionStatus(server));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBasicUpdating(false);
    }
  }, [server]);

  const rebuild = useCallback(async () => {
    setShowRebuildConfirm(false);
    setRebuilding(true);
    setError(null);
    try {
      await rebuildAtlasCache();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRebuilding(false);
    }
  }, [refresh]);

  const requestRecognitionDownload = useCallback(async () => {
    setError(null);
    setRecognitionResult(null);
    if (!recognitionStatus?.prepared) {
      setError(t('atlas.updateBasicDataFirst'));
      return;
    }
    if (recognitionStatus.total === 0) {
      setError(t('atlas.noRecognitionAssets'));
      return;
    }
    setShowRecognitionConfirm(true);
  }, [recognitionStatus, t]);

  const downloadRecognitionAssets = useCallback(async () => {
    setShowRecognitionConfirm(false);
    setRecognitionDownloading(true);
    setRecognitionCancelling(false);
    setRecognitionProgress({
      downloaded: 0,
      skipped: 0,
      failed: 0,
      total: recognitionStatus?.total ?? 0,
    });
    setError(null);
    try {
      setRecognitionResult(await downloadAllServantRecognitionAssets(server));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!message.includes('下载已取消') && !message.includes('Cancelled')) {
        setError(message);
      }
    } finally {
      setRecognitionDownloading(false);
      setRecognitionCancelling(false);
    }
  }, [recognitionStatus?.total, server]);

  const cancelRecognitionDownload = useCallback(async () => {
    setRecognitionCancelling(true);
    try {
      await cancelAtlasImageDownload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setRecognitionCancelling(false);
    }
  }, []);

  const ready = (status?.available ?? false) && (recognitionStatus?.prepared ?? false);
  const hasActiveOperation = basicUpdating || rebuilding || recognitionDownloading;
  const completedRecognitionAssets = recognitionProgress
    ? recognitionProgress.downloaded + recognitionProgress.skipped + recognitionProgress.failed
    : 0;
  const recognitionPercent =
    recognitionProgress && recognitionProgress.total > 0
      ? Math.min(100, Math.floor((completedRecognitionAssets / recognitionProgress.total) * 100))
      : 0;

  return (
    <section id="section-atlas" className="space-y-4 scroll-mt-6">
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">{t('atlas.title')}</h2>
      </div>

      <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-text-primary">
            {t('atlas.basicServants', { server })}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">{t('atlas.basicServantsHint')}</p>
        </div>

        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={t('atlas.server')}>
          {ATLAS_SERVERS.map((candidate) => {
            const active = candidate === server;
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setServer(candidate);
                  setStatus(null);
                  setRecognitionStatus(null);
                  setRecognitionResult(null);
                  setError(null);
                }}
                disabled={hasActiveOperation}
                className={
                  active
                    ? 'rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60'
                    : 'rounded-lg bg-bg-tertiary px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60'
                }
              >
                {candidate}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-bg-primary px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-text-secondary">{t('atlas.status')}</span>
            <span className={ready ? 'font-medium text-accent' : 'font-medium text-text-muted'}>
              {loading
                ? t('atlas.loading')
                : ready
                  ? t('atlas.available', { count: status?.count ?? 0 })
                  : t('atlas.notDownloaded')}
            </span>
          </div>
          {cacheDir && (
            <p className="mt-2 break-all text-xs text-text-muted">
              {t('atlas.cachePath')}: {cacheDir}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-danger">{t('atlas.error', { message: error })}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void updateBasicData()}
            disabled={loading || hasActiveOperation}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={basicUpdating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {basicUpdating
              ? t('atlas.updating')
              : ready
                ? t('atlas.refreshBasicData')
                : t('atlas.downloadBasicData')}
          </button>
          <button
            type="button"
            onClick={() =>
              void (recognitionDownloading
                ? cancelRecognitionDownload()
                : requestRecognitionDownload())
            }
            disabled={loading || basicUpdating || rebuilding || recognitionCancelling}
            className="inline-flex items-center gap-2 rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Database className={recognitionDownloading ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            {recognitionCancelling
              ? t('atlas.cancellingRecognitionAssets')
              : recognitionDownloading
                ? t('atlas.downloadProgress', { percent: recognitionPercent })
                : t('atlas.downloadAllServantAssets')}
          </button>
          <button
            type="button"
            onClick={() => setShowRebuildConfirm(true)}
            disabled={loading || hasActiveOperation}
            className="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AlertTriangle className="h-4 w-4" />
            {t('atlas.rebuildCache')}
          </button>
        </div>

        {recognitionStatus?.prepared && (
          <p className="text-xs text-text-muted">
            {t('atlas.recognitionAssetsPrepared', { count: recognitionStatus.total })}
          </p>
        )}
        {recognitionResult && (
          <p className="text-xs text-text-muted">
            {t('atlas.recognitionAssetsResult', {
              downloaded: recognitionResult.downloaded,
              skipped: recognitionResult.skipped,
              failed: recognitionResult.failed,
            })}
          </p>
        )}

        <p className="text-xs leading-5 text-text-muted">{t('atlas.futureAssetHint')}</p>
      </div>

      <ConfirmDialog
        open={showRebuildConfirm}
        title={t('atlas.rebuildCacheTitle')}
        message={t('atlas.rebuildCacheMessage')}
        confirmText={t('atlas.rebuildCacheConfirm')}
        cancelText={t('common.cancel')}
        destructive
        onConfirm={() => void rebuild()}
        onCancel={() => setShowRebuildConfirm(false)}
      >
        <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text-secondary">
          <div className="flex items-center gap-2 font-medium text-error">
            <AlertTriangle className="h-4 w-4" />
            {t('atlas.rebuildCacheWarning')}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t('atlas.rebuildDeletesCatalogues')}</li>
            <li>{t('atlas.rebuildDeletesServantAssets')}</li>
            <li>{t('atlas.rebuildDeletesOtherAssets')}</li>
          </ul>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={showRecognitionConfirm}
        title={t('atlas.downloadAllServantAssetsTitle')}
        message={t('atlas.downloadAllServantAssetsMessage', {
          count: recognitionStatus?.total ?? 0,
        })}
        confirmText={t('atlas.downloadAllServantAssetsConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={() => void downloadRecognitionAssets()}
        onCancel={() => setShowRecognitionConfirm(false)}
      >
        <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text-secondary">
          <div className="flex items-center gap-2 font-medium text-error">
            <AlertTriangle className="h-4 w-4" />
            {t('atlas.downloadAllServantAssetsWarning')}
          </div>
          <p className="mt-2">{t('atlas.downloadAllServantAssetsKinds')}</p>
        </div>
      </ConfirmDialog>
    </section>
  );
}
