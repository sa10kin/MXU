import { normalizeAgentConfigs } from '@/types/interface';
import { loggers } from '@/utils/logger';
import { isTauri } from '@/utils/paths';
import { useAppStore } from '@/stores/appStore';

import { maaService } from './maaService';
import { cancelTaskQueueMonitor } from './taskMonitor';

const log = loggers.task;

const STOP_TIMEOUT_MS = 8000;
const STOP_REPOST_INTERVAL_MS = 800;
const STOP_POLL_INTERVAL_MS = 100;

const stopPromises = new Map<string, Promise<boolean>>();

async function waitForTaskStop(instanceId: string) {
  const start = Date.now();
  let lastPost = start;

  while (Date.now() - start < STOP_TIMEOUT_MS) {
    const running = await maaService.isRunning(instanceId);
    if (!running) {
      return true;
    }

    if (Date.now() - lastPost >= STOP_REPOST_INTERVAL_MS) {
      try {
        await maaService.stopTask(instanceId);
        lastPost = Date.now();
      } catch (error) {
        log.warn(`[task-stop#${instanceId}] 重发停止请求失败:`, error);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_INTERVAL_MS));
  }

  return false;
}

function cleanupTaskState(instanceId: string) {
  const state = useAppStore.getState();
  state.updateInstance(instanceId, { isRunning: false });
  state.setInstanceTaskStatus(instanceId, null);
  state.setInstanceCurrentTaskId(instanceId, null);
  state.clearScheduleExecution(instanceId);
}

/**
 * 任务队列自然结束后回收本轮 agent 子进程，避免每次启动累积一个存活 agent。
 *
 * 必须先等待 tasker 完全空闲：在控制器动作收尾期间销毁 AgentClient 会触发
 * MaaFramework 原生崩溃（EventDispatcher 通知已释放的订阅者）。等待与清理
 * 时序与手动停止路径（stopInstanceTasks）保持一致；超时则跳过本轮回收。
 */
export async function stopAgentsAfterTasksCompleted(instanceId: string): Promise<void> {
  if (stopPromises.has(instanceId)) {
    // 手动停止流程正在进行，由其负责 agent 清理
    return;
  }
  const agentConfigs = normalizeAgentConfigs(useAppStore.getState().projectInterface?.agent);
  if (!agentConfigs || agentConfigs.length === 0) {
    return;
  }
  try {
    const start = Date.now();
    while (Date.now() - start < STOP_TIMEOUT_MS) {
      const running = await maaService.isRunning(instanceId);
      if (!running) {
        await maaService.stopAgent(instanceId);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, STOP_POLL_INTERVAL_MS));
    }
    log.warn(`[agent-cleanup#${instanceId}] 等待任务空闲超时，跳过本轮 agent 回收`);
  } catch (err) {
    log.warn(`[agent-cleanup#${instanceId}] 任务结束后回收 agent 失败:`, err);
  }
}

export async function stopInstanceTasks(instanceId: string): Promise<boolean> {
  const existing = stopPromises.get(instanceId);
  if (existing) {
    return existing;
  }

  const stopPromise = (async () => {
    log.info(`[task-stop#${instanceId}] 停止任务`);

    try {
      await maaService.stopTask(instanceId);
    } catch (error) {
      const stillRunning = await maaService.isRunning(instanceId).catch(() => false);
      if (stillRunning) {
        throw error;
      }
      log.info(`[task-stop#${instanceId}] Tasker 已停止，跳过首次 stop 错误`);
    }

    const stopped = await waitForTaskStop(instanceId);
    if (!stopped) {
      log.warn(`[task-stop#${instanceId}] 等待任务停止超时，保留运行状态`);
      return false;
    }

    cancelTaskQueueMonitor(instanceId);

    const agentConfigs = normalizeAgentConfigs(useAppStore.getState().projectInterface?.agent);
    if (agentConfigs && agentConfigs.length > 0) {
      await maaService.stopAgent(instanceId);
    }

    cleanupTaskState(instanceId);
    return true;
  })().finally(() => {
    stopPromises.delete(instanceId);
  });

  stopPromises.set(instanceId, stopPromise);
  return stopPromise;
}

export async function stopInstanceTasksAndExitApp(instanceId: string): Promise<boolean> {
  const stopped = await stopInstanceTasks(instanceId);
  if (!stopped) {
    return false;
  }

  if (!isTauri()) {
    return true;
  }

  const { exit } = await import('@tauri-apps/plugin-process');
  await exit(0);
  return true;
}
