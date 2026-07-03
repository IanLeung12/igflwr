import type { ActionType, QueuedAction } from './types';
import { apiFollow, apiUnfollow, apiRemoveFollower } from './api';
import { addActionToHistory, updateActionInHistory, getDailyActionCount, loadStorage } from './storage';

let isProcessing = false;
let shouldStop = false;

export function cancelQueue(): void {
  shouldStop = true;
}

export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  shouldStop = false;

  try {
    while (!shouldStop) {
      const data = await loadStorage();
      const pending = data.actionHistory.find((a) => a.status === 'pending');
      if (!pending) break;

      const settings = data.settings;
      if (settings.safeMode) {
        const dailyCount = await getDailyActionCount();
        if (dailyCount >= settings.dailyActionLimit) {
          const allPending = data.actionHistory.filter((a) => a.status === 'pending');
          for (const p of allPending) {
            p.status = 'failed';
            p.error = 'Daily action limit reached';
            await updateActionInHistory(p);
          }
          break;
        }
      }

      pending.status = 'running';
      await updateActionInHistory(pending);

      let success = false;
      try {
        switch (pending.type) {
          case 'follow':
            success = await apiFollow(pending.username);
            break;
          case 'unfollow':
            success = await apiUnfollow(pending.username);
            break;
          case 'remove_follower':
            success = await apiRemoveFollower(pending.username);
            break;
        }
      } catch (err) {
        pending.status = 'failed';
        pending.error = String(err);
        await updateActionInHistory(pending);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      pending.status = success ? 'completed' : 'failed';
      if (!success) pending.error = 'Action did not complete';
      await updateActionInHistory(pending);

      await new Promise((r) => setTimeout(r, settings.actionDelay));
    }
  } finally {
    isProcessing = false;
  }
}

export function enqueueAction(type: ActionType, username: string): void {
  const action: QueuedAction = {
    id: `${type}_${username}_${Date.now()}`,
    type,
    username,
    status: 'pending',
    timestamp: Date.now(),
  };

  addActionToHistory(action).then(() => processQueue());
}

export async function enqueueBatch(type: ActionType, usernames: string[]): Promise<void> {
  for (const username of usernames) {
    const action: QueuedAction = {
      id: `${type}_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      username,
      status: 'pending',
      timestamp: Date.now(),
    };
    await addActionToHistory(action);
  }
  processQueue();
}
