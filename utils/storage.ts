import { browser } from 'wxt/browser';
import type { InstagramUser, QueuedAction, Settings, StorageData } from './types';
import { DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'igflwr_data';

function parseStorage(raw: unknown): StorageData {
  if (!raw || typeof raw !== 'object') {
    return { followers: [], following: [], actionHistory: [], settings: { ...DEFAULT_SETTINGS } };
  }
  const d = raw as Record<string, unknown>;
  return {
    followers: Array.isArray(d.followers) ? d.followers as InstagramUser[] : [],
    following: Array.isArray(d.following) ? d.following as InstagramUser[] : [],
    actionHistory: Array.isArray(d.actionHistory) ? d.actionHistory as QueuedAction[] : [],
    settings: d.settings && typeof d.settings === 'object'
      ? { ...DEFAULT_SETTINGS, ...d.settings as Partial<Settings> }
      : { ...DEFAULT_SETTINGS },
  };
}

export async function loadStorage(): Promise<StorageData> {
  try {
    const result = await browser.storage.local.get(STORAGE_KEY);
    return parseStorage(result[STORAGE_KEY]);
  } catch {
    return { followers: [], following: [], actionHistory: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

export async function saveStorage(data: StorageData): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: data });
}

export async function saveFollowers(followers: InstagramUser[]): Promise<void> {
  const existing = await browser.storage.local.get(STORAGE_KEY).then(r => r[STORAGE_KEY] || {});
  await browser.storage.local.set({ [STORAGE_KEY]: { ...existing, followers } });
}

export async function saveFollowing(following: InstagramUser[]): Promise<void> {
  const existing = await browser.storage.local.get(STORAGE_KEY).then(r => r[STORAGE_KEY] || {});
  await browser.storage.local.set({ [STORAGE_KEY]: { ...existing, following } });
}

export async function addActionToHistory(action: QueuedAction): Promise<void> {
  const data = await loadStorage();
  data.actionHistory.unshift(action);
  if (data.actionHistory.length > 1000) {
    data.actionHistory = data.actionHistory.slice(0, 1000);
  }
  await saveStorage(data);
}

export async function updateActionInHistory(updated: QueuedAction): Promise<void> {
  const data = await loadStorage();
  const idx = data.actionHistory.findIndex((a) => a.id === updated.id);
  if (idx !== -1) {
    data.actionHistory[idx] = updated;
    await saveStorage(data);
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const data = await loadStorage();
  data.settings = settings;
  await saveStorage(data);
}

export async function getDailyActionCount(): Promise<number> {
  const data = await loadStorage();
  const today = new Date().toDateString();
  return data.actionHistory.filter(
    (a) =>
      a.status === 'completed' &&
      new Date(a.timestamp).toDateString() === today,
  ).length;
}
