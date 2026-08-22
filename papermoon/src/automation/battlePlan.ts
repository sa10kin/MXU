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
  specialEffect?: SkillSpecialEffect;
  cards?: BattleCard[];
}

export interface SkillSpecialEffect {
  type: 'orderChange' | 'moveSelfToBack' | 'retire';
  front?: number;
  back?: number;
  servant?: number;
}

export interface BattleCard {
  type: string;
  servant?: number;
  colors?: string[];
  onMissing?: string;
  specialEffect?: SkillSpecialEffect;
}

export type BattlePlanWarning =
  | { type: 'servantSkill'; servant: number; skill: number; target?: number }
  | { type: 'masterSkill'; skill: number };

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
  validateFormationSequence(plan, partySlots, errors);
  return [...new Set(errors)];
}

export function formationBeforeAction(
  plan: BattlePlan,
  waveIndex: number,
  turnIndex: number,
  actionIndex: number,
): number[] {
  const formation = Array<number>(6).fill(0);
  plan.party.forEach(({ slot }) => (formation[slot - 1] = slot));
  for (let wave = 0; wave <= waveIndex; wave++) {
    for (let turn = 0; turn < (plan.waves[wave]?.turns.length ?? 0); turn++) {
      for (let action = 0; action < (plan.waves[wave].turns[turn]?.actions.length ?? 0); action++) {
        if (wave === waveIndex && turn === turnIndex && action === actionIndex) return formation;
        const current = plan.waves[wave].turns[turn].actions[action];
        applyFormationEffect(formation, current.specialEffect, current.servant);
        if (current.type === 'attack') {
          current.cards?.forEach((card) =>
            applyFormationEffect(formation, card.specialEffect, card.servant),
          );
        }
      }
      if (wave === waveIndex && turn === turnIndex) return formation;
    }
  }
  return formation;
}

function validateFormationSequence(plan: BattlePlan, party: Set<number>, errors: string[]) {
  plan.waves?.forEach((wave, waveIndex) =>
    wave.turns?.forEach((turn, turnIndex) =>
      turn.actions?.forEach((action, actionIndex) => {
        const path = `waves[${waveIndex}].turns[${turnIndex}].actions[${actionIndex}]`;
        const formation = formationBeforeAction(plan, waveIndex, turnIndex, actionIndex);
        const front = new Set(formation.slice(0, 3).filter(Boolean));
        const back = new Set(formation.slice(3).filter(Boolean));
        if (action.type === 'servantSkill') {
          if (party.has(action.servant ?? 0) && !front.has(action.servant ?? 0)) {
            errors.push(`${path}.servant`);
          }
          if (action.target && party.has(action.target) && !front.has(action.target)) {
            errors.push(`${path}.target`);
          }
          validateDynamicEffect(action.specialEffect, action.servant, path, front, back, errors);
        } else if (action.type === 'masterSkill') {
          if (action.target && party.has(action.target) && !front.has(action.target)) {
            errors.push(`${path}.target`);
          }
          validateDynamicEffect(action.specialEffect, undefined, path, front, back, errors);
        } else if (action.type === 'attack') {
          action.cards?.forEach((card, cardIndex) => {
            if (card.type !== 'np') return;
            const cardPath = `${path}.cards[${cardIndex}]`;
            if (party.has(card.servant ?? 0) && !front.has(card.servant ?? 0)) {
              errors.push(`${cardPath}.servant`);
            }
            validateDynamicEffect(card.specialEffect, card.servant, cardPath, front, back, errors);
          });
        }
      }),
    ),
  );
}

function validateDynamicEffect(
  effect: SkillSpecialEffect | undefined,
  actor: number | undefined,
  path: string,
  front: Set<number>,
  back: Set<number>,
  errors: string[],
) {
  if (!effect) return;
  const effectPath = `${path}.specialEffect`;
  if (effect.type === 'orderChange') {
    if (!front.has(effect.front ?? 0)) errors.push(`${effectPath}.front`);
    if (!back.has(effect.back ?? 0)) errors.push(`${effectPath}.back`);
  } else if (effect.type === 'moveSelfToBack') {
    if (!front.has(actor ?? 0)) errors.push(`${effectPath}.actor`);
  } else if (effect.type === 'retire' && !front.has(effect.servant ?? 0)) {
    errors.push(`${effectPath}.servant`);
  }
}

function applyFormationEffect(
  formation: number[],
  effect: SkillSpecialEffect | undefined,
  actor?: number,
) {
  if (!effect) return;
  if (effect.type === 'orderChange') {
    const front = formation.indexOf(effect.front ?? 0);
    const back = formation.indexOf(effect.back ?? 0);
    if (front >= 0 && front < 3 && back >= 3) {
      [formation[front], formation[back]] = [formation[back], formation[front]];
    }
    return;
  }
  const servant = effect.type === 'moveSelfToBack' ? actor : effect.servant;
  const front = formation.indexOf(servant ?? 0);
  if (front < 0 || front >= 3) return;
  const reserves = formation.slice(3).filter(Boolean);
  formation[front] = reserves.shift() ?? 0;
  const back = [...reserves, ...(effect.type === 'moveSelfToBack' ? [servant!] : [])];
  formation.splice(3, 3, ...back, ...Array(3 - back.length).fill(0));
}

export function battlePlanWarnings(plan: BattlePlan): BattlePlanWarning[] {
  const warnings: BattlePlanWarning[] = [];
  const usedSkills = new Set<string>();
  plan.waves?.forEach((wave) =>
    wave.turns?.forEach((turn) =>
      turn.actions?.forEach((action) => {
        const skill =
          action.type === 'servantSkill'
            ? `servant:${action.servant}:${action.skill}`
            : action.type === 'masterSkill'
              ? `master:${action.skill}`
              : '';
        if (skill && usedSkills.has(skill)) {
          if (action.type === 'servantSkill') {
            warnings.push({
              type: 'servantSkill',
              servant: action.servant ?? 0,
              skill: action.skill ?? 0,
              target: action.target,
            });
          } else {
            warnings.push({
              type: 'masterSkill',
              skill: action.skill ?? 0,
            });
          }
        }
        if (skill) usedSkills.add(skill);
      }),
    ),
  );
  return warnings;
}

function validateAction(action: BattleAction, path: string, party: Set<number>, errors: string[]) {
  const validParty = (slot = 0) => party.has(slot);
  const validOptionalParty = (slot = 0) => slot === 0 || party.has(slot);
  switch (action.type) {
    case 'servantSkill':
      if (!validParty(action.servant)) errors.push(`${path}.servant`);
      if (!between(action.skill, 1, 3)) errors.push(`${path}.skill`);
      if (!validOptionalParty(action.target)) errors.push(`${path}.target`);
      validateFormationEffect(
        action.specialEffect,
        action.servant,
        `${path}.specialEffect`,
        party,
        errors,
      );
      break;
    case 'masterSkill':
      if (!between(action.skill, 1, 3)) errors.push(`${path}.skill`);
      if (!validOptionalParty(action.target)) errors.push(`${path}.target`);
      if (action.specialEffect) {
        if (action.specialEffect.type !== 'orderChange') {
          errors.push(`${path}.specialEffect.type`);
        } else {
          if (action.target) errors.push(`${path}.target`);
          if (!validParty(action.specialEffect.front)) errors.push(`${path}.specialEffect.front`);
          if (!validParty(action.specialEffect.back)) errors.push(`${path}.specialEffect.back`);
          if (action.specialEffect.front === action.specialEffect.back) {
            errors.push(`${path}.specialEffect`);
          }
          if (action.specialEffect.servant !== undefined)
            errors.push(`${path}.specialEffect.servant`);
        }
      }
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
          validateFormationEffect(
            card.specialEffect,
            card.servant,
            `${cardPath}.specialEffect`,
            party,
            errors,
          );
        } else if (card.type === 'command') {
          if (!validOptionalParty(card.servant)) errors.push(`${cardPath}.servant`);
          if (card.specialEffect) errors.push(`${cardPath}.specialEffect`);
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

function validateFormationEffect(
  effect: SkillSpecialEffect | undefined,
  actor: number | undefined,
  path: string,
  party: Set<number>,
  errors: string[],
) {
  if (!effect) return;
  if (effect.type === 'moveSelfToBack') {
    if (effect.front !== undefined || effect.back !== undefined || effect.servant !== undefined) {
      errors.push(path);
    }
  } else if (effect.type === 'retire') {
    if (!party.has(effect.servant ?? 0)) errors.push(`${path}.servant`);
    if (effect.front !== undefined || effect.back !== undefined) errors.push(path);
  } else {
    errors.push(`${path}.type`);
  }
  if (!party.has(actor ?? 0)) errors.push(`${path}.actor`);
}

function between(value: number | undefined, min: number, max: number): boolean {
  return Number.isInteger(value) && (value ?? 0) >= min && (value ?? 0) <= max;
}
