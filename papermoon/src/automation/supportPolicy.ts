export const SUPPORT_POLICY_SCHEMA_VERSION = 1;

export interface SupportPolicy {
  schemaVersion: 1;
  servantId: number;
  craftEssenceId?: number;
  craftEssenceMlb?: boolean;
  minServantLevel: number;
  minNoblePhantasmLevel: number;
  requireMaxSkills: [boolean, boolean, boolean];
  maxRefreshes: number;
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
    'craftEssenceId',
    'craftEssenceMlb',
    'minServantLevel',
    'minNoblePhantasmLevel',
    'requireMaxSkills',
    'maxRefreshes',
  ]);
  const unknownField = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unknownField) throw new Error(`unknown SupportPolicy field: ${unknownField}`);
  return value as SupportPolicy;
}

export function serializeSupportPolicy(policy: SupportPolicy): string {
  return JSON.stringify(policy);
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
