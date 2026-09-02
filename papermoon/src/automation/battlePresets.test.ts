import { describe, expect, it } from 'vitest';

import { emptyBattlePlan } from './battlePlan';
import {
  battlePresetMatches,
  battlePresetSetup,
  parseBattlePreset,
  serializeBattlePreset,
  upsertBattlePreset,
  type BattlePreset,
} from './battlePresets';
import { emptyBondPolicy } from './bondPolicy';
import { emptySupportPolicy } from './supportPolicy';

describe('battle presets', () => {
  it('updates a same-name preset without changing its identity', () => {
    const existing: BattlePreset = {
      id: 'preset-1',
      name: '3T',
      updatedAt: 'old',
      plan: { ...emptyBattlePlan(), name: 'old' },
      supportPolicy: emptySupportPolicy(),
    };
    const plan = { ...emptyBattlePlan(), name: 'new' };
    const policy = { ...emptySupportPolicy(), servantId: 284 };
    const bond = { ...emptyBondPolicy(), slots: [{ slot: 1, onBondMax: 'stop' as const }] };
    const result = upsertBattlePreset([existing], '3T', plan, policy, bond);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-1');
    expect(result[0].plan).toBe(plan);
    expect(result[0].supportPolicy).toBe(policy);
    expect(result[0].bondPolicy).toBe(bond);
    expect(battlePresetMatches(result[0], plan, policy, bond)).toBe(true);
    expect(battlePresetMatches(result[0], plan, emptySupportPolicy(), bond)).toBe(false);
    // 牵绊配置也是队伍的一部分：只有它变了同样算「已修改」。
    expect(battlePresetMatches(result[0], plan, policy, emptyBondPolicy())).toBe(false);
  });

  it('restores a loaded setup or returns a clean setup without one', () => {
    const preset: BattlePreset = {
      id: 'preset-1',
      name: 'loaded',
      updatedAt: 'now',
      plan: { ...emptyBattlePlan(), name: 'loaded', party: [{ slot: 1, servantId: 1 }] },
      supportPolicy: { ...emptySupportPolicy(), servantId: 284 },
    };
    // 旧预设没有 bondPolicy，读回来按「不处理」补齐，语义与未配置一致。
    expect(battlePresetSetup(preset)).toEqual({
      plan: preset.plan,
      supportPolicy: preset.supportPolicy,
      bondPolicy: emptyBondPolicy(),
    });
    expect(battlePresetSetup(null)).toEqual({
      plan: emptyBattlePlan(),
      supportPolicy: emptySupportPolicy(),
      bondPolicy: emptyBondPolicy(),
    });
    expect(parseBattlePreset(serializeBattlePreset(preset))).toEqual({
      ...preset,
      bondPolicy: emptyBondPolicy(),
    });

    const withBond: BattlePreset = {
      ...preset,
      bondPolicy: { ...emptyBondPolicy(), slots: [{ slot: 1, onBondMax: 'stop' }] },
    };
    expect(parseBattlePreset(serializeBattlePreset(withBond))).toEqual(withBond);
    expect(battlePresetSetup(withBond).bondPolicy).toEqual(withBond.bondPolicy);
  });
});
