import { describe, expect, it } from 'vitest';

import {
  emptySupportPolicy,
  parseSupportPolicy,
  serializeSupportPolicy,
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
    expect(
      validateSupportPolicy({ ...emptySupportPolicy(), craftEssenceId: 9401270 }),
    ).toEqual([]);
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
