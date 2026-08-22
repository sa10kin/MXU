export const SUPPORT_POLICY_SCHEMA_VERSION = 1;

export interface SupportPolicy {
  schemaVersion: 1;
  servantId: number;
  servantType?: 'normal' | 'grand';
  craftEssenceId?: number;
  craftEssenceMlb?: boolean;
  craftEssences?: CraftEssenceFilter[];
  requireBondCraftEssence?: boolean;
  rewardCraftEssenceId?: number;
  rewardCraftEssenceMlb?: boolean;
  minServantLevel: number;
  minNoblePhantasmLevel: number;
  requireMaxSkills: [boolean, boolean, boolean];
  maxRefreshes: number;
}

export interface CraftEssenceFilter {
  id: number;
  mlb?: boolean;
}

export function supportCraftEssences(policy: SupportPolicy): CraftEssenceFilter[] {
  const filters = new Map<number, CraftEssenceFilter>();
  const add = (filter?: CraftEssenceFilter) => {
    if (!filter?.id) return;
    const mlb = filters.get(filter.id)?.mlb || filter.mlb;
    filters.set(filter.id, { id: filter.id, ...(mlb ? { mlb: true } : {}) });
  };
  (Array.isArray(policy.craftEssences) ? policy.craftEssences : []).forEach(add);
  add(
    policy.craftEssenceId ? { id: policy.craftEssenceId, mlb: policy.craftEssenceMlb } : undefined,
  );
  add(
    policy.rewardCraftEssenceId
      ? { id: policy.rewardCraftEssenceId, mlb: policy.rewardCraftEssenceMlb }
      : undefined,
  );
  return [...filters.values()];
}

export function withSupportCraftEssences(
  policy: SupportPolicy,
  craftEssences: CraftEssenceFilter[],
): SupportPolicy {
  const { craftEssenceId, craftEssenceMlb, rewardCraftEssenceId, rewardCraftEssenceMlb, ...rest } =
    policy;
  return { ...rest, craftEssences: craftEssences.length ? craftEssences : undefined };
}

export function emptySupportPolicy(): SupportPolicy {
  return {
    schemaVersion: SUPPORT_POLICY_SCHEMA_VERSION,
    servantId: 0,
    minServantLevel: 0,
    minNoblePhantasmLevel: 0,
    requireMaxSkills: [false, false, false],
    maxRefreshes: 8,
  };
}

export function parseSupportPolicy(raw: string): SupportPolicy {
  if (!raw.trim()) return emptySupportPolicy();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SupportPolicy must be a JSON object');
  }
  const allowedFields = new Set([
    'schemaVersion',
    'servantId',
    'servantType',
    'craftEssenceId',
    'craftEssenceMlb',
    'craftEssences',
    'requireBondCraftEssence',
    'rewardCraftEssenceId',
    'rewardCraftEssenceMlb',
    'minServantLevel',
    'minNoblePhantasmLevel',
    'requireMaxSkills',
    'maxRefreshes',
  ]);
  const unknownField = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unknownField) throw new Error(`unknown SupportPolicy field: ${unknownField}`);
  const policy = value as SupportPolicy;
  return withSupportCraftEssences(policy, supportCraftEssences(policy));
}

export function serializeSupportPolicy(policy: SupportPolicy): string {
  return JSON.stringify(withSupportCraftEssences(policy, supportCraftEssences(policy)));
}

export function validateSupportPolicy(policy: SupportPolicy): string[] {
  const errors: string[] = [];
  if (policy.schemaVersion !== SUPPORT_POLICY_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!Number.isInteger(policy.servantId) || policy.servantId < 0) errors.push('servantId');
  if (
    policy.craftEssenceId !== undefined &&
    (!Number.isInteger(policy.craftEssenceId) || policy.craftEssenceId <= 0)
  ) {
    errors.push('craftEssenceId');
  }
  if (policy.craftEssenceMlb && !policy.craftEssenceId) errors.push('craftEssenceMlb');
  if (
    policy.craftEssences !== undefined &&
    (!Array.isArray(policy.craftEssences) ||
      policy.craftEssences.some(
        (filter) =>
          !filter ||
          !Number.isInteger(filter.id) ||
          filter.id <= 0 ||
          (filter.mlb !== undefined && typeof filter.mlb !== 'boolean'),
      ) ||
      new Set(policy.craftEssences.map((filter) => filter.id)).size !== policy.craftEssences.length)
  ) {
    errors.push('craftEssences');
  }
  if (policy.servantType !== undefined && !['normal', 'grand'].includes(policy.servantType)) {
    errors.push('servantType');
  }
  if (
    policy.rewardCraftEssenceId !== undefined &&
    (!Number.isInteger(policy.rewardCraftEssenceId) || policy.rewardCraftEssenceId <= 0)
  ) {
    errors.push('rewardCraftEssenceId');
  }
  if (policy.rewardCraftEssenceMlb && !policy.rewardCraftEssenceId) {
    errors.push('rewardCraftEssenceMlb');
  }
  if (policy.requireBondCraftEssence && policy.servantType !== 'grand') {
    errors.push('servantType');
  }
  if (
    policy.servantType === 'grand' &&
    !policy.servantId &&
    supportCraftEssences(policy).length === 0
  ) {
    errors.push('servantId');
  }
  if (
    !Number.isInteger(policy.minServantLevel) ||
    policy.minServantLevel < 0 ||
    policy.minServantLevel > 120
  ) {
    errors.push('minServantLevel');
  }
  if (
    !Number.isInteger(policy.minNoblePhantasmLevel) ||
    policy.minNoblePhantasmLevel < 0 ||
    policy.minNoblePhantasmLevel > 5
  ) {
    errors.push('minNoblePhantasmLevel');
  }
  if (
    !Array.isArray(policy.requireMaxSkills) ||
    policy.requireMaxSkills.length !== 3 ||
    policy.requireMaxSkills.some((required) => typeof required !== 'boolean')
  ) {
    errors.push('requireMaxSkills');
  }
  if (
    !Number.isInteger(policy.maxRefreshes) ||
    policy.maxRefreshes < 0 ||
    policy.maxRefreshes > 50
  ) {
    errors.push('maxRefreshes');
  }
  return errors;
}

export function supportErrorsForParty(party: PartySlot[], errors: string[]): string[] {
  return party.some((member) => member.support) ? errors : [];
}
import type { PartySlot } from './battlePlan';
