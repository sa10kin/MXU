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
    const result = upsertBattlePreset([existing], '3T', plan, policy);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('preset-1');
    expect(result[0].plan).toBe(plan);
    expect(result[0].supportPolicy).toBe(policy);
    expect(battlePresetMatches(result[0], plan, policy)).toBe(true);
    expect(battlePresetMatches(result[0], plan, emptySupportPolicy())).toBe(false);
  });

  it('restores a loaded setup or returns a clean setup without one', () => {
    const preset: BattlePreset = {
      id: 'preset-1',
      name: 'loaded',
      updatedAt: 'now',
      plan: { ...emptyBattlePlan(), name: 'loaded', party: [{ slot: 1, servantId: 1 }] },
      supportPolicy: { ...emptySupportPolicy(), servantId: 284 },
    };
    expect(battlePresetSetup(preset)).toEqual({
      plan: preset.plan,
      supportPolicy: preset.supportPolicy,
    });
    expect(battlePresetSetup(null)).toEqual({
      plan: emptyBattlePlan(),
      supportPolicy: emptySupportPolicy(),
    });
    expect(parseBattlePreset(serializeBattlePreset(preset))).toEqual(preset);
  });
});
