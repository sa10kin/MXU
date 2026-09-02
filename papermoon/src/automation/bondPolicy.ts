import type { PartySlot } from './battlePlan';

export const BOND_POLICY_SCHEMA_VERSION = 1;

/** 到达牵绊上限后的处置方式。Go 侧 protocol.BondPolicy 是权威模型，这里只做映射。 */
export type BondOnMax = 'stop' | 'dreamFire' | 'swapServant';

/** 阶段一只实现 stop；其余两项在协议里已定义，界面置灰并标注未实现。 */
export const IMPLEMENTED_BOND_ON_MAX: BondOnMax[] = ['stop'];

export const BOND_MAX_DREAM_FIRE_USES = 5;

export interface BondPolicy {
  schemaVersion: 1;
  slots: BondSlotRule[];
}

export interface BondSlotRule {
  slot: number;
  onBondMax: BondOnMax;
  dreamFire?: { maxUses: number };
  backupServantIds?: number[];
}

export function emptyBondPolicy(): BondPolicy {
  return { schemaVersion: BOND_POLICY_SCHEMA_VERSION, slots: [] };
}

export function parseBondPolicy(raw: string): BondPolicy {
  if (!raw.trim()) return emptyBondPolicy();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('BondPolicy must be a JSON object');
  }
  const unknownField = Object.keys(value).find((key) => key !== 'schemaVersion' && key !== 'slots');
  if (unknownField) throw new Error(`unknown BondPolicy field: ${unknownField}`);
  const policy = value as BondPolicy;
  return { ...policy, slots: Array.isArray(policy.slots) ? policy.slots : [] };
}

export function serializeBondPolicy(policy: BondPolicy): string {
  return JSON.stringify({
    ...policy,
    slots: [...policy.slots].sort((left, right) => left.slot - right.slot),
  });
}

export function bondRule(policy: BondPolicy, slot: number): BondSlotRule | undefined {
  return policy.slots.find((rule) => rule.slot === slot);
}

/**
 * withBondRule 设置或清除某个槽位的规则。onBondMax 为空表示「不处理」，
 * 直接移除该槽位，避免留下语义为空的条目。
 */
export function withBondRule(
  policy: BondPolicy,
  slot: number,
  onBondMax: BondOnMax | '',
): BondPolicy {
  const slots = policy.slots.filter((rule) => rule.slot !== slot);
  if (onBondMax) slots.push({ slot, onBondMax });
  return { ...policy, slots: slots.sort((left, right) => left.slot - right.slot) };
}

/**
 * withBondPolicyForParty 丢弃已经不成立的规则。助战槽不涨牵绊、结算页也不列出，
 * 指向它的规则永远不会触发；队伍里已经没有的槽位同理。勾选助战或清空槽位时调用，
 * 否则配置会静默失效并在启动时被 Agent 拒绝。
 */
export function withBondPolicyForParty(policy: BondPolicy, party: PartySlot[]): BondPolicy {
  const own = new Set(
    party.filter((member) => !member.support && member.servantId).map((member) => member.slot),
  );
  const slots = policy.slots.filter((rule) => own.has(rule.slot));
  return slots.length === policy.slots.length ? policy : { ...policy, slots };
}

export function validateBondPolicy(policy: BondPolicy, party: PartySlot[]): string[] {
  const errors: string[] = [];
  if (policy.schemaVersion !== BOND_POLICY_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!Array.isArray(policy.slots)) return [...errors, 'slots'];

  const seen = new Set<number>();
  policy.slots.forEach((rule, index) => {
    const path = `slots[${index}]`;
    if (!Number.isInteger(rule?.slot) || rule.slot < 1 || rule.slot > 6) {
      errors.push(`${path}.slot`);
      return;
    }
    if (seen.has(rule.slot)) errors.push(`${path}.slot`);
    seen.add(rule.slot);

    const member = party.find((item) => item.slot === rule.slot);
    if (!member || member.support || !member.servantId) errors.push(`${path}.slot`);

    if (!IMPLEMENTED_BOND_ON_MAX.includes(rule.onBondMax)) {
      errors.push(`${path}.onBondMax`);
      return;
    }
    if (rule.dreamFire !== undefined) errors.push(`${path}.dreamFire`);
    if (rule.backupServantIds !== undefined) errors.push(`${path}.backupServantIds`);
  });
  return errors;
}
