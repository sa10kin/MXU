import { describe, expect, it } from 'vitest';

import {
  battlePlanWarnings,
  emptyBattlePlan,
  parseBattlePlan,
  serializeBattlePlan,
  validateBattlePlan,
} from './battlePlan';
import type { BattlePlan } from './battlePlan';

describe('BattlePlan editor helpers', () => {
  it('round-trips a valid minimal plan', () => {
    const plan: BattlePlan = {
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
    expect(validateBattlePlan(emptyBattlePlan())).toEqual(['party', 'waves']);
  });

  it('keeps support data only in SupportPolicy', () => {
    const plan: BattlePlan = {
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

  it('requires the default noble phantasm owner to be selected', () => {
    const plan: BattlePlan = {
      ...emptyBattlePlan(),
      party: [1, 2, 3].map((slot) => ({ slot, servantId: slot })),
      waves: [
        {
          turns: [
            {
              actions: [{ type: 'attack', cards: [{ type: 'np', onMissing: 'stop' }] }],
            },
          ],
        },
      ],
    };

    expect(validateBattlePlan(plan)).toContain('waves[0].turns[0].actions[0].cards[0].servant');
  });

  it('reports skills reused later in the plan', () => {
    const plan: BattlePlan = {
      ...emptyBattlePlan(),
      name: 'reused skill',
      party: [
        { slot: 1, servantId: 100100 },
        { slot: 2, servantId: 200100 },
        { slot: 4, servantId: 400100 },
      ],
      waves: [
        {
          turns: [
            {
              actions: [
                { type: 'servantSkill', servant: 1, skill: 2, target: 2 },
                { type: 'masterSkill', skill: 3 },
                { type: 'attack', cards: [{ type: 'command', colors: ['arts'] }] },
              ],
            },
          ],
        },
        {
          turns: [
            {
              actions: [
                { type: 'servantSkill', servant: 1, skill: 2, target: 2 },
                {
                  type: 'masterSkill',
                  skill: 3,
                  specialEffect: { type: 'orderChange', front: 1, back: 4 },
                },
                { type: 'attack', cards: [{ type: 'command', colors: ['arts'] }] },
              ],
            },
          ],
        },
      ],
    };

    expect(validateBattlePlan(plan)).toEqual([]);
    expect(battlePlanWarnings(plan)).toEqual([
      { type: 'servantSkill', servant: 1, skill: 2, target: 2 },
      { type: 'masterSkill', skill: 3 },
    ]);
  });

  it('validates formation effects on skills and noble phantasms', () => {
    const plan: BattlePlan = {
      ...emptyBattlePlan(),
      name: 'formation effects',
      party: [
        { slot: 1, servantId: 100100 },
        { slot: 2, servantId: 200100 },
        { slot: 4, servantId: 400100 },
      ],
      waves: [
        {
          turns: [
            {
              actions: [
                {
                  type: 'servantSkill',
                  servant: 1,
                  skill: 3,
                  specialEffect: { type: 'moveSelfToBack' },
                },
                {
                  type: 'attack',
                  cards: [
                    {
                      type: 'np',
                      servant: 2,
                      onMissing: 'skip',
                      specialEffect: { type: 'retire', servant: 2 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateBattlePlan(plan)).toEqual([]);
  });

  it('rejects stale slots against the current formation', () => {
    const plan: BattlePlan = {
      ...emptyBattlePlan(),
      name: 'stale formation',
      party: [1, 2, 3, 4].map((slot) => ({ slot, servantId: slot })),
      waves: [
        {
          turns: [
            {
              actions: [
                {
                  type: 'masterSkill',
                  skill: 3,
                  specialEffect: { type: 'orderChange', front: 2, back: 4 },
                },
                { type: 'servantSkill', servant: 2, skill: 1 },
                { type: 'attack', cards: [{ type: 'command', colors: ['arts'] }] },
              ],
            },
          ],
        },
      ],
    };
    expect(validateBattlePlan(plan)).toContain('waves[0].turns[0].actions[1].servant');
    plan.waves[0].turns[0].actions[0].specialEffect = {
      type: 'orderChange',
      front: 2,
      back: 2,
    };
    expect(validateBattlePlan(plan)).toContain('waves[0].turns[0].actions[0].specialEffect.back');
  });
});
