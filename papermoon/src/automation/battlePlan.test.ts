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
      waves: [
        {
          turns: [
            {
              actions: [
                {
                  type: 'attack',
                  cards: [{ type: 'command', colors: ['buster', 'arts', 'quick'] }],
                },
              ],
            },
          ],
        },
      ],
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

  it('reports invalid action references before Go validation', () => {
    const plan = {
      ...emptyBattlePlan(),
      name: 'invalid action',
      party: [{ slot: 1, servantId: 100100 }],
      waves: [
        {
          turns: [
            {
              actions: [
                { type: 'servantSkill', servant: 2, skill: 4 },
                {
                  type: 'attack',
                  cards: [
                    { type: 'np', servant: 1, onMissing: 'stop' },
                    { type: 'np', servant: 1, onMissing: 'stop' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const errors = validateBattlePlan(plan);
    expect(errors).toContain('waves[0].turns[0].actions[0].servant');
    expect(errors).toContain('waves[0].turns[0].actions[0].skill');
    expect(errors).toContain('waves[0].turns[0].actions[1].cards[1].servant');
  });
});
