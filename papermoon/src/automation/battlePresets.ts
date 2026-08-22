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

export function loadBattlePresets(): BattlePreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(BATTLE_PRESET_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? (value as BattlePreset[]) : [];
  } catch {
    return [];
  }
}

export function saveBattlePresets(presets: BattlePreset[]) {
  localStorage.setItem(BATTLE_PRESET_STORAGE_KEY, JSON.stringify(presets));
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
