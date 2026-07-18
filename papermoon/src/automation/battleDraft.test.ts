import { describe, expect, it } from 'vitest';

import { emptyBattlePlan } from './battlePlan';
import {
  addAction,
  addAttackCard,
  addTurn,
  addWave,
  emptyTurn,
  moveAction,
  removeAction,
  removeAttackCard,
} from './battleDraft';

describe('battle draft helpers', () => {
  it('creates waves and turns with one final attack', () => {
    const withWave = addWave(emptyBattlePlan());
    const plan = addTurn(withWave, 0);
    expect(plan.waves[0].turns).toHaveLength(2);
    expect(
      plan.waves[0].turns.every((turn) => turn.actions[turn.actions.length - 1]?.type === 'attack'),
    ).toBe(true);
  });

  it('keeps attack fixed as the final action', () => {
    let turn = addAction(emptyTurn(), 'servantSkill');
    turn = addAction(turn, 'masterSkill');
    turn = moveAction(turn, 0, 1);
    expect(turn.actions.map(({ type }) => type)).toEqual(['masterSkill', 'servantSkill', 'attack']);
    expect(removeAction(turn, 2)).toEqual(turn);
  });

  it('limits attack cards to three and keeps at least one', () => {
    let turn = emptyTurn();
    turn = addAttackCard(turn, { type: 'np', servant: 1, onMissing: 'stop' });
    turn = addAttackCard(turn, { type: 'np', servant: 2, onMissing: 'skip' });
    turn = addAttackCard(turn, { type: 'np', servant: 3, onMissing: 'stop' });
    expect(turn.actions[turn.actions.length - 1]?.cards).toHaveLength(3);
    turn = removeAttackCard(turn, 2);
    turn = removeAttackCard(turn, 1);
    turn = removeAttackCard(turn, 0);
    expect(turn.actions[turn.actions.length - 1]?.cards).toHaveLength(1);
  });
});
