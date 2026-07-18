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
  const partySlots = new Set(plan.party?.map(({ slot }) => slot) ?? []);
  let totalTurns = 0;
  plan.waves?.forEach((wave, waveIndex) => {
    if (!Array.isArray(wave.turns) || wave.turns.length === 0) {
      errors.push(`waves[${waveIndex}].turns`);
    }
    wave.turns?.forEach((turn, turnIndex) => {
      totalTurns += 1;
      const path = `waves[${waveIndex}].turns[${turnIndex}]`;
      const attacks = turn.actions?.filter((action) => action.type === 'attack') ?? [];
      if (attacks.length !== 1 || turn.actions[turn.actions.length - 1]?.type !== 'attack') {
        errors.push(`${path}.actions`);
      }
      turn.actions?.forEach((action, actionIndex) =>
        validateAction(action, `${path}.actions[${actionIndex}]`, partySlots, errors),
      );
    });
  });
  if (totalTurns > plan.maxTurns) errors.push('waves.maxTurns');
  return errors;
}

function validateAction(action: BattleAction, path: string, party: Set<number>, errors: string[]) {
  const validParty = (slot = 0) => party.has(slot);
  const validOptionalParty = (slot = 0) => slot === 0 || party.has(slot);
  switch (action.type) {
    case 'servantSkill':
      if (!validParty(action.servant)) errors.push(`${path}.servant`);
      if (!between(action.skill, 1, 3)) errors.push(`${path}.skill`);
      if (!validOptionalParty(action.target)) errors.push(`${path}.target`);
      break;
    case 'masterSkill':
      if (!between(action.skill, 1, 3)) errors.push(`${path}.skill`);
      if (!validOptionalParty(action.target)) errors.push(`${path}.target`);
      break;
    case 'orderChange':
      if (!between(action.front, 1, 3) || !validParty(action.front)) errors.push(`${path}.front`);
      if (!between(action.back, 4, 6) || !validParty(action.back)) errors.push(`${path}.back`);
      break;
    case 'targetEnemy':
      if (!between(action.enemy, 1, 3)) errors.push(`${path}.enemy`);
      break;
    case 'attack': {
      if (!action.cards || action.cards.length < 1 || action.cards.length > 3) {
        errors.push(`${path}.cards`);
        break;
      }
      const noblePhantasms = new Set<number>();
      action.cards.forEach((card, cardIndex) => {
        const cardPath = `${path}.cards[${cardIndex}]`;
        if (card.type === 'np') {
          if (!validParty(card.servant) || noblePhantasms.has(card.servant ?? 0)) {
            errors.push(`${cardPath}.servant`);
          }
          noblePhantasms.add(card.servant ?? 0);
          if (card.onMissing !== 'stop' && card.onMissing !== 'skip') {
            errors.push(`${cardPath}.onMissing`);
          }
        } else if (card.type === 'command') {
          if (!validOptionalParty(card.servant)) errors.push(`${cardPath}.servant`);
          const colors = card.colors ?? [];
          if (
            colors.length < 1 ||
            colors.length > 3 ||
            new Set(colors).size !== colors.length ||
            colors.some((color) => !['buster', 'arts', 'quick'].includes(color))
          ) {
            errors.push(`${cardPath}.colors`);
          }
        } else {
          errors.push(`${cardPath}.type`);
        }
      });
      break;
    }
    default:
      errors.push(`${path}.type`);
  }
}

function between(value: number | undefined, min: number, max: number): boolean {
  return Number.isInteger(value) && (value ?? 0) >= min && (value ?? 0) <= max;
}
