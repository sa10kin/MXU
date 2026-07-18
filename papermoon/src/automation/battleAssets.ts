/**
 * 自动战斗任务启动前的素材保障（docs/auto-battle.md「战前素材策略」）：
 *
 * - 从者识别素材缺失时由客户端自动补齐，可取消，取消后不开始任务；
 * - 概念礼装素材保持例外：缺失即阻止开始，提示用户回队伍配置手动下载；
 * - Go Agent 预检保持只读，是素材状态的最终权威闸门。
 */
import { getInterfaceLangKey } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import type { OptionValue } from '@/types/interface';
import { loggers } from '@/utils/logger';

import {
  cancelAtlasImageDownload,
  downloadServantRecognitionAssetsFor,
  ensureCraftEssences,
  getCachedCraftEssenceIds,
  type AtlasServer,
} from '../atlas/atlasService';
import { parseBattlePlan } from './battlePlan';
import { parseSupportPolicy } from './supportPolicy';

const log = loggers.task;

export type EnsureAssetsResult = 'ready' | 'blocked' | 'cancelled';

export interface EnsureAssetsOptions {
  server: AtlasServer;
  value: OptionValue | undefined;
  emit: (type: 'info' | 'success' | 'error', message: string) => void;
  shouldStop: () => boolean;
}

export function collectIds(value: OptionValue): {
  servantIds: number[];
  craftEssenceIds: number[];
} {
  const servants = new Set<number>();
  const craftEssences = new Set<number>();
  if (value.type !== 'input') return { servantIds: [], craftEssenceIds: [] };
  const plan = parseBattlePlan(value.values.json || '');
  for (const member of plan.party) {
    if (member.servantId) servants.add(member.servantId);
    if (member.craftEssenceId) craftEssences.add(member.craftEssenceId);
  }
  if (plan.party.some((member) => member.support)) {
    const policy = parseSupportPolicy(value.values.support || '');
    if (policy.servantId) servants.add(policy.servantId);
    if (policy.craftEssenceId) craftEssences.add(policy.craftEssenceId);
  }
  return { servantIds: [...servants], craftEssenceIds: [...craftEssences] };
}

/**
 * 补齐自动战斗计划所需素材。配置无法解析时直接放行，由 Go 预检报告配置错误。
 */
export async function ensureAutoBattleAssets(
  options: EnsureAssetsOptions,
): Promise<EnsureAssetsResult> {
  const { server, value, emit, shouldStop } = options;
  const state = useAppStore.getState();
  const langKey = getInterfaceLangKey(state.language);
  const text = (key: string) =>
    state.resolveI18nText(`$auto_battle.assets.${key}`, langKey) || key;

  if (!value) return 'ready';
  let servantIds: number[];
  let craftEssenceIds: number[];
  try {
    ({ servantIds, craftEssenceIds } = collectIds(value));
  } catch {
    return 'ready';
  }
  if (servantIds.length === 0 && craftEssenceIds.length === 0) return 'ready';

  // 礼装例外：只检查、不下载
  if (craftEssenceIds.length > 0) {
    let missing = craftEssenceIds;
    try {
      const catalog = await ensureCraftEssences(server);
      const entriesById = new Map(catalog.map((entry) => [entry.id, entry]));
      const known = craftEssenceIds
        .map((id) => entriesById.get(id))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
      const cached = await getCachedCraftEssenceIds(server, known);
      missing = craftEssenceIds.filter((id) => !cached.has(id));
    } catch (err) {
      log.warn(`[battle-assets] 检查礼装缓存失败:`, err);
    }
    if (missing.length > 0) {
      emit('error', text('ce_missing').replace('{ids}', missing.join(', ')));
      return 'blocked';
    }
  }

  if (servantIds.length === 0) return 'ready';
  if (shouldStop()) return 'cancelled';
  emit('info', text('preparing'));

  // 用户在下载期间点击停止时中断共享下载任务
  const watcher = setInterval(() => {
    if (shouldStop()) void cancelAtlasImageDownload();
  }, 200);
  let result;
  try {
    result = await downloadServantRecognitionAssetsFor(server, servantIds);
  } catch (err) {
    log.error(`[battle-assets] 从者识别素材下载失败:`, err);
    emit('error', text('download_failed').replace('{failed}', String(err)));
    return 'blocked';
  } finally {
    clearInterval(watcher);
  }

  if (result === null) {
    emit('error', text('index_missing'));
    return 'blocked';
  }
  if (shouldStop()) {
    emit('info', text('download_cancelled'));
    return 'cancelled';
  }
  if (result.failed > 0) {
    log.warn(`[battle-assets] 素材下载失败明细:`, result.errors);
    emit('error', text('download_failed').replace('{failed}', String(result.failed)));
    return 'blocked';
  }
  if (result.downloaded > 0) {
    emit(
      'success',
      text('download_done')
        .replace('{downloaded}', String(result.downloaded))
        .replace('{skipped}', String(result.skipped)),
    );
  }
  return 'ready';
}
