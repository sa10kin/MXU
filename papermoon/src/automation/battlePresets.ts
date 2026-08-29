import { isTauri } from '@/utils/paths';

import {
  emptyBattlePlan,
  parseBattlePlan,
  serializeBattlePlan,
  type BattlePlan,
} from './battlePlan';
import type { SupportPolicy } from './supportPolicy';
import { emptySupportPolicy, parseSupportPolicy, serializeSupportPolicy } from './supportPolicy';

export interface BattlePreset {
  id: string;
  name: string;
  updatedAt: string;
  plan: BattlePlan;
  supportPolicy?: SupportPolicy;
}

export const BATTLE_PRESET_STORAGE_KEY = 'papermoon-battle-presets-v1';

function parsePresetList(raw: string | null): BattlePreset[] {
  if (raw === null) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as BattlePreset[]) : [];
  } catch {
    return [];
  }
}

function loadLegacyPresets(): BattlePreset[] {
  try {
    return parsePresetList(localStorage.getItem(BATTLE_PRESET_STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * 读取队伍预设。
 *
 * 预设存在 PaperMoon 数据目录的 config/battle-presets.json 里，而不是 localStorage：
 * macOS 上 WKWebView 的数据目录随 bundle identifier 分区，以 .app 启动和直接跑裸
 * 二进制会看到两份不同的 localStorage。数据目录由 get_data_dir 决定，与启动方式无关。
 *
 * 文件还不存在时（首次升级）把 localStorage 里的旧数据迁过去；localStorage 保持原样
 * 作为回退备份，不做删除。非 Tauri 环境（浏览器 WebUI）仍然只能用 localStorage。
 */
export async function loadBattlePresets(): Promise<BattlePreset[]> {
  if (!isTauri()) return loadLegacyPresets();
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const stored = await invoke<string | null>('read_battle_presets');
    if (stored !== null) return parsePresetList(stored);
    const legacy = loadLegacyPresets();
    if (legacy.length > 0) await saveBattlePresets(legacy);
    return legacy;
  } catch {
    return loadLegacyPresets();
  }
}

export async function saveBattlePresets(presets: BattlePreset[]) {
  const content = JSON.stringify(presets);
  if (!isTauri()) {
    localStorage.setItem(BATTLE_PRESET_STORAGE_KEY, content);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('write_battle_presets', { content });
}

export function parseBattlePreset(raw: string): BattlePreset | null {
  if (!raw.trim()) return null;
  const value = JSON.parse(raw) as Partial<BattlePreset>;
  if (!value.plan || typeof value.name !== 'string') throw new Error('invalid battle preset');
  return {
    id: typeof value.id === 'string' ? value.id : '',
    name: value.name,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    plan: parseBattlePlan(JSON.stringify(value.plan)),
    supportPolicy: value.supportPolicy
      ? parseSupportPolicy(JSON.stringify(value.supportPolicy))
      : emptySupportPolicy(),
  };
}

export function serializeBattlePreset(preset: BattlePreset): string {
  return JSON.stringify(preset);
}

export function upsertBattlePreset(
  presets: BattlePreset[],
  name: string,
  plan: BattlePlan,
  supportPolicy: SupportPolicy,
): BattlePreset[] {
  const existing = presets.find((preset) => preset.name === name);
  const preset = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    updatedAt: new Date().toISOString(),
    plan,
    supportPolicy,
  };
  return existing
    ? presets.map((current) => (current.id === existing.id ? preset : current))
    : [...presets, preset];
}

export function battlePresetMatches(
  preset: BattlePreset,
  plan: BattlePlan,
  supportPolicy: SupportPolicy,
): boolean {
  return (
    serializeBattlePlan(preset.plan) === serializeBattlePlan(plan) &&
    serializeSupportPolicy(preset.supportPolicy ?? emptySupportPolicy()) ===
      serializeSupportPolicy(supportPolicy)
  );
}

export function battlePresetSetup(preset: BattlePreset | null): {
  plan: BattlePlan;
  supportPolicy: SupportPolicy;
} {
  return preset
    ? {
        plan: parseBattlePlan(serializeBattlePlan(preset.plan)),
        supportPolicy: parseSupportPolicy(
          serializeSupportPolicy(preset.supportPolicy ?? emptySupportPolicy()),
        ),
      }
    : { plan: emptyBattlePlan(), supportPolicy: emptySupportPolicy() };
}
