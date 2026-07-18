import type { BattleAction, BattleCard, BattlePlan, Turn } from './battlePlan';

export type DraftActionType = 'servantSkill' | 'masterSkill' | 'orderChange' | 'targetEnemy';

export function emptyTurn(): Turn {
  return {
    actions: [
      {
        type: 'attack',
        cards: [{ type: 'command', colors: ['buster', 'arts', 'quick'] }],
      },
    ],
  };
}

export function addWave(plan: BattlePlan): BattlePlan {
  return { ...plan, waves: [...plan.waves, { turns: [emptyTurn()] }] };
}

export function removeWave(plan: BattlePlan, waveIndex: number): BattlePlan {
  return { ...plan, waves: plan.waves.filter((_, index) => index !== waveIndex) };
}

export function addTurn(plan: BattlePlan, waveIndex: number): BattlePlan {
  return updateWave(plan, waveIndex, (turns) => [...turns, emptyTurn()]);
}

export function removeTurn(plan: BattlePlan, waveIndex: number, turnIndex: number): BattlePlan {
  return updateWave(plan, waveIndex, (turns) => turns.filter((_, index) => index !== turnIndex));
}

export function addAction(turn: Turn, type: DraftActionType): Turn {
  const action = defaultAction(type);
  return {
    ...turn,
    actions: [...turn.actions.slice(0, -1), action, turn.actions[turn.actions.length - 1]],
  };
}

export function updateAction(turn: Turn, actionIndex: number, action: BattleAction): Turn {
  return {
    ...turn,
    actions: turn.actions.map((current, index) => (index === actionIndex ? action : current)),
  };
}

export function removeAction(turn: Turn, actionIndex: number): Turn {
  if (turn.actions[actionIndex]?.type === 'attack') return turn;
  return { ...turn, actions: turn.actions.filter((_, index) => index !== actionIndex) };
}

export function moveAction(turn: Turn, actionIndex: number, offset: -1 | 1): Turn {
  const target = actionIndex + offset;
  const lastEditable = turn.actions.length - 2;
  if (actionIndex < 0 || actionIndex > lastEditable || target < 0 || target > lastEditable) {
    return turn;
  }
  const actions = [...turn.actions];
  [actions[actionIndex], actions[target]] = [actions[target], actions[actionIndex]];
  return { ...turn, actions };
}

export function updateTurn(
  plan: BattlePlan,
  waveIndex: number,
  turnIndex: number,
  turn: Turn,
): BattlePlan {
  return updateWave(plan, waveIndex, (turns) =>
    turns.map((current, index) => (index === turnIndex ? turn : current)),
  );
}

export function addAttackCard(turn: Turn, card: BattleCard): Turn {
  const attackIndex = turn.actions.findIndex((action) => action.type === 'attack');
  const attack = turn.actions[attackIndex];
  if (!attack || (attack.cards?.length ?? 0) >= 3) return turn;
  return updateAction(turn, attackIndex, { ...attack, cards: [...(attack.cards ?? []), card] });
}

export function updateAttackCard(turn: Turn, cardIndex: number, card: BattleCard): Turn {
  const attackIndex = turn.actions.findIndex((action) => action.type === 'attack');
  const attack = turn.actions[attackIndex];
  if (!attack) return turn;
  return updateAction(turn, attackIndex, {
    ...attack,
    cards: attack.cards?.map((current, index) => (index === cardIndex ? card : current)),
  });
}

export function removeAttackCard(turn: Turn, cardIndex: number): Turn {
  const attackIndex = turn.actions.findIndex((action) => action.type === 'attack');
  const attack = turn.actions[attackIndex];
  if (!attack || (attack.cards?.length ?? 0) <= 1) return turn;
  return updateAction(turn, attackIndex, {
    ...attack,
    cards: attack.cards?.filter((_, index) => index !== cardIndex),
  });
}

function updateWave(
  plan: BattlePlan,
  waveIndex: number,
  update: (turns: Turn[]) => Turn[],
): BattlePlan {
  return {
    ...plan,
    waves: plan.waves.map((wave, index) =>
      index === waveIndex ? { ...wave, turns: update(wave.turns) } : wave,
    ),
  };
}

function defaultAction(type: DraftActionType): BattleAction {
  switch (type) {
    case 'servantSkill':
      return { type, servant: 1, skill: 1 };
    case 'masterSkill':
      return { type, skill: 1 };
    case 'orderChange':
      return { type, front: 1, back: 4 };
    case 'targetEnemy':
      return { type, enemy: 1 };
  }
}
