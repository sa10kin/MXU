import { describe, expect, it } from 'vitest';

import type { PartySlot } from './battlePlan';
import {
  bondRule,
  emptyBondPolicy,
  parseBondPolicy,
  serializeBondPolicy,
  validateBondPolicy,
  withBondPolicyForParty,
  withBondRule,
} from './bondPolicy';

const party: PartySlot[] = [
  { slot: 1, servantId: 100 },
  { slot: 2, servantId: 200 },
  { slot: 3, support: true },
];

describe('BondPolicy editor helpers', () => {
  it('round-trips a policy and keeps slots sorted', () => {
    const policy = withBondRule(withBondRule(emptyBondPolicy(), 2, 'stop'), 1, 'stop');
    expect(policy.slots.map((rule) => rule.slot)).toEqual([1, 2]);
    expect(parseBondPolicy(serializeBondPolicy(policy))).toEqual(policy);
    expect(validateBondPolicy(policy, party)).toEqual([]);
  });

  it('treats an empty string and an empty policy as disabled', () => {
    expect(parseBondPolicy('')).toEqual(emptyBondPolicy());
    expect(validateBondPolicy(emptyBondPolicy(), party)).toEqual([]);
  });

  it('rejects unknown fields so the Go side never sees them', () => {
    expect(() => parseBondPolicy('{"schemaVersion":1,"slots":[],"notifyBefore":5}')).toThrow(
      /notifyBefore/,
    );
  });

  it('clears a rule when the slot is set back to no action', () => {
    const policy = withBondRule(emptyBondPolicy(), 1, 'stop');
    expect(bondRule(policy, 1)?.onBondMax).toBe('stop');
    expect(bondRule(withBondRule(policy, 1, ''), 1)).toBeUndefined();
  });

  // 助战不涨牵绊，结算页也不列出助战，指向助战槽的规则永远不会触发。
  it('rejects rules that point at the support slot or an empty slot', () => {
    expect(validateBondPolicy(withBondRule(emptyBondPolicy(), 3, 'stop'), party)).toEqual([
      'slots[0].slot',
    ]);
    expect(validateBondPolicy(withBondRule(emptyBondPolicy(), 5, 'stop'), party)).toEqual([
      'slots[0].slot',
    ]);
  });

  it('reports the modes that are not implemented yet', () => {
    const policy = { ...emptyBondPolicy(), slots: [{ slot: 1, onBondMax: 'dreamFire' as const }] };
    expect(validateBondPolicy(policy, party)).toEqual(['slots[0].onBondMax']);
  });

  // 勾选助战或清空从者后，原来的规则必须一起消失，否则启动时才被 Agent 拒绝。
  it('drops rules when the party changes', () => {
    const policy = withBondRule(withBondRule(emptyBondPolicy(), 1, 'stop'), 2, 'stop');
    const next = withBondPolicyForParty(policy, [
      { slot: 1, servantId: 100 },
      { slot: 2, support: true },
    ]);
    expect(next.slots.map((rule) => rule.slot)).toEqual([1]);
    // 没有变化时返回同一个引用，避免无谓的重渲染与草稿写盘。
    expect(withBondPolicyForParty(next, party)).toBe(next);
  });
});
