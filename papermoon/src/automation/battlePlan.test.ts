import { describe, expect, it } from 'vitest';

import {
  emptyBattlePlan,
  parseBattlePlan,
  serializeBattlePlan,
  validateBattlePlan,
} from './battlePlan';

describe('BattlePlan editor helpers', () => {
  it('round-trips a valid minimal plan', () => {
    const plan = {
      ...emptyBattlePlan(),
      name: '3T',
      party: [{ slot: 1, servantId: 100100 }],
      waves: [{ turns: [{ actions: [{ type: 'attack' }] }] }],
    };

    expect(parseBattlePlan(serializeBattlePlan(plan))).toEqual(plan);
    expect(validateBattlePlan(plan)).toEqual([]);
  });

  it('keeps incomplete drafts but reports their paths', () => {
    expect(validateBattlePlan(emptyBattlePlan())).toEqual(['name', 'party', 'waves']);
  });

  it('keeps support data only in SupportPolicy', () => {
    const plan = {
      ...emptyBattlePlan(),
      name: 'support',
      party: [
        { slot: 1, support: true },
        { slot: 2, servantId: 2, support: true },
      ],
      waves: [{ turns: [{ actions: [{ type: 'attack' }] }] }],
    };
    expect(validateBattlePlan(plan)).toContain('party.support');
    expect(validateBattlePlan(plan)).toContain('party[1].support');
  });

  it('rejects removed draft fields', () => {
    expect(() => parseBattlePlan('{"schemaVersion":1,"description":"legacy"}')).toThrow(
      'description',
    );
  });
});
