import { describe, expect, it } from 'vitest';

import { latestBattleProgress } from './loopPolicy';

describe('LoopPolicy editor helpers', () => {
  it('recovers the latest progress for the selected plan', () => {
    const messages = [
      'PaperMoon 战斗: 开始方案 "方案 A"，0/6 场，体力恢复 bronze',
      'PaperMoon 周回: 已完成 1/6 场，继续下一场',
      'PaperMoon 周回: 方案 "方案 A"，已完成 2/6 场，继续下一场',
      'PaperMoon 战斗: 开始方案 "方案 B"，0/3 场，体力恢复 none',
      'PaperMoon 周回: 方案 "方案 B"，已完成 1/3 场，继续下一场',
    ];
    expect(latestBattleProgress(messages, '方案 A')).toEqual({ done: 2, target: 6 });
    expect(latestBattleProgress(messages, '方案 B')).toEqual({ done: 1, target: 3 });
  });
});
