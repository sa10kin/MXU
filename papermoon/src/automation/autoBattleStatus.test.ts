import { describe, expect, it } from 'vitest';

import { emptyBattlePlan } from './battlePlan';
import { describeAutoBattleErrors } from './autoBattleStatus';

describe('auto battle status', () => {
  it('turns storage paths into locations a user can follow', () => {
    const text = (key: string) =>
      ({
        'status.error.location': '第 {wave} 波 · 第 {turn} 回合 · 动作 {action}：',
        'status.error.order_back': '请选择要换上的当前后备从者。',
      })[key] ?? key;
    expect(
      describeAutoBattleErrors(
        ['waves[1].turns[2].actions[0].specialEffect.back'],
        emptyBattlePlan(),
        text,
      ),
    ).toEqual(['第 2 波 · 第 3 回合 · 动作 1：请选择要换上的当前后备从者。']);
  });
});
