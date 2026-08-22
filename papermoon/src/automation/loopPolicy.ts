export type RecoveryItem = 'none' | 'gold' | 'silver' | 'bronze' | 'copper';

export interface BattleProgress {
  done: number;
  target: number;
}

export function latestBattleProgress(messages: string[], planName: string): BattleProgress | null {
  const quotedPlanName = JSON.stringify(planName);
  let activePlan = '';
  let latest: BattleProgress | null = null;
  for (const message of messages) {
    const started = message.match(/PaperMoon 战斗: 开始方案 ("(?:\\.|[^"])*")，(\d+)\/(\d+) 场/);
    if (started) {
      activePlan = started[1];
      if (activePlan === quotedPlanName) {
        latest = { done: Number(started[2]), target: Number(started[3]) };
      }
      continue;
    }
    const completed = message.match(
      /PaperMoon 周回: (?:方案 ("(?:\\.|[^"])*")，)?已完成 (\d+)\/(\d+) 场/,
    );
    if (!completed) continue;
    const completedPlan = completed[1] ?? activePlan;
    if (completedPlan === quotedPlanName) {
      latest = { done: Number(completed[2]), target: Number(completed[3]) };
    }
  }
  return latest;
}
