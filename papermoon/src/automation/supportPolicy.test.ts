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

  it('requires a servant or craft essence target', () => {
    expect(validateSupportPolicy(emptySupportPolicy())).toEqual(['target']);
    expect(
      validateSupportPolicy({ ...emptySupportPolicy(), craftEssenceId: 9401270 }),
    ).toEqual([]);
  });

  it('requires the target only when the party uses a support slot', () => {
    const empty = emptySupportPolicy();
    const errors = validateSupportPolicy(empty);
    expect(supportErrorsForParty([{ slot: 1, servantId: 1 }], errors)).toEqual([]);
    expect(supportErrorsForParty([{ slot: 1, support: true }], errors)).toEqual(['target']);
  });

  it('rejects removed fields', () => {
    expect(() => parseSupportPolicy('{"schemaVersion":1,"validateActiveSkills":true}')).toThrow(
      'validateActiveSkills',
    );
  });
});
