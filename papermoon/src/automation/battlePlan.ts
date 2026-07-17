export const BATTLE_PLAN_SCHEMA_VERSION = 1;

export interface BattlePlan {
  schemaVersion: 1;
  name: string;
  party: PartySlot[];
  maxTurns: number;
  waves: Wave[];
}

export interface PartySlot {
  slot: number;
  servantId?: number;
  craftEssenceId?: number;
  support?: boolean;
}

export interface Wave {
  turns: Turn[];
}

export interface Turn {
  actions: BattleAction[];
}

export interface BattleAction {
  type: string;
  servant?: number;
  skill?: number;
  target?: number;
  enemy?: number;
  front?: number;
  back?: number;
  cards?: BattleCard[];
}

export interface BattleCard {
  type: string;
  servant?: number;
  colors?: string[];
  onMissing?: string;
}

export function emptyBattlePlan(): BattlePlan {
  return {
    schemaVersion: BATTLE_PLAN_SCHEMA_VERSION,
    name: '',
    party: [],
    maxTurns: 3,
    waves: [],
  };
}

export function parseBattlePlan(raw: string): BattlePlan {
  if (!raw.trim()) return emptyBattlePlan();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('BattlePlan must be a JSON object');
  }
  const allowedFields = new Set(['schemaVersion', 'name', 'party', 'maxTurns', 'waves']);
  const unknownField = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unknownField) throw new Error(`unknown BattlePlan field: ${unknownField}`);
  return value as BattlePlan;
}

export function serializeBattlePlan(plan: BattlePlan): string {
  return JSON.stringify(plan);
}

// The Go validator remains authoritative. This only gives immediate editor feedback.
export function validateBattlePlan(plan: BattlePlan): string[] {
  const errors: string[] = [];
  if (plan.schemaVersion !== BATTLE_PLAN_SCHEMA_VERSION) errors.push('schemaVersion');
  if (!plan.name.trim()) errors.push('name');
  if (!Array.isArray(plan.party) || plan.party.length < 1 || plan.party.length > 6) {
    errors.push('party');
  }
  if (plan.party?.filter((member) => member.support).length > 1) errors.push('party.support');
  plan.party?.forEach((member, index) => {
    if (member.support) {
      if (member.servantId || member.craftEssenceId) errors.push(`party[${index}].support`);
    } else if (!Number.isInteger(member.servantId) || (member.servantId ?? 0) <= 0) {
      errors.push(`party[${index}].servantId`);
    }
  });
  if (!Number.isInteger(plan.maxTurns) || plan.maxTurns < 1 || plan.maxTurns > 100) {
    errors.push('maxTurns');
  }
  if (!Array.isArray(plan.waves) || plan.waves.length === 0) errors.push('waves');
  plan.waves?.forEach((wave, waveIndex) => {
    wave.turns?.forEach((turn, turnIndex) => {
      const attacks = turn.actions?.filter((action) => action.type === 'attack') ?? [];
      if (attacks.length !== 1 || turn.actions[turn.actions.length - 1]?.type !== 'attack') {
        errors.push(`waves[${waveIndex}].turns[${turnIndex}].actions`);
      }
    });
  });
  return errors;
}
