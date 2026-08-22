import { describe, expect, it } from 'vitest';

import {
  emptySupportPolicy,
  parseSupportPolicy,
  serializeSupportPolicy,
  supportCraftEssences,
  supportErrorsForParty,
  validateSupportPolicy,
} from './supportPolicy';

describe('SupportPolicy editor helpers', () => {
  it('round-trips a complete policy', () => {
    const policy = {
      ...emptySupportPolicy(),
      servantId: 500900,
      requireMaxSkills: [true, true, true] as [boolean, boolean, boolean],
    };
    expect(parseSupportPolicy(serializeSupportPolicy(policy))).toEqual(policy);
    expect(validateSupportPolicy(policy)).toEqual([]);
  });

  it('allows an empty target to select any support', () => {
    expect(validateSupportPolicy(emptySupportPolicy())).toEqual([]);
    expect(validateSupportPolicy({ ...emptySupportPolicy(), craftEssenceId: 9401270 })).toEqual([]);
  });

  it('round-trips grand support filters', () => {
    const policy = {
      ...emptySupportPolicy(),
      servantId: 304800,
      servantType: 'grand' as const,
      requireBondCraftEssence: true,
      craftEssences: [{ id: 9403990, mlb: true }, { id: 9404000 }],
    };
    expect(validateSupportPolicy(policy)).toEqual([]);
    expect(parseSupportPolicy(serializeSupportPolicy(policy))).toEqual(policy);
  });

  it('requires grand type only for the bond craft essence condition', () => {
    expect(
      validateSupportPolicy({ ...emptySupportPolicy(), requireBondCraftEssence: true }),
    ).toContain('servantType');
  });

  it('migrates both legacy craft essence slots into one pool', () => {
    const policy = parseSupportPolicy(
      JSON.stringify({
        ...emptySupportPolicy(),
        craftEssenceId: 1,
        rewardCraftEssenceId: 2,
        rewardCraftEssenceMlb: true,
      }),
    );
    expect(supportCraftEssences(policy)).toEqual([{ id: 1 }, { id: 2, mlb: true }]);
    expect(serializeSupportPolicy(policy)).not.toContain('rewardCraftEssenceId');
  });

  it('does not block a support slot with an empty target', () => {
    const empty = emptySupportPolicy();
    const errors = validateSupportPolicy(empty);
    expect(supportErrorsForParty([{ slot: 1, servantId: 1 }], errors)).toEqual([]);
    expect(supportErrorsForParty([{ slot: 1, support: true }], errors)).toEqual([]);
  });

  it('rejects removed fields', () => {
    expect(() => parseSupportPolicy('{"schemaVersion":1,"validateActiveSkills":true}')).toThrow(
      'validateActiveSkills',
    );
  });
});
