import type { InstagramUser } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getVisibleDialog(): HTMLElement | null {
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const d of dialogs) {
    const html = d as HTMLElement;
    if (html.offsetParent !== null) return html;
  }
  return null;
}

function findHeader(): HTMLElement | null {
  const selectors = [
    'section main header',
    'header section',
    'main div[class*="profile"]',
    'div[class*="profileHeader"]',
    'div[class*="header"] section',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/followers/"]');
  for (const a of anchors) {
    const parent = a.closest<HTMLElement>('section, div[class]');
    if (parent) return parent;
  }
  return null;
}

function clickText(container: HTMLElement, target: string): boolean {
  for (const el of container.querySelectorAll<HTMLElement>('span, a, div, button')) {
    const text = el.textContent?.toLowerCase().trim() || '';
    if (text === target.toLowerCase() && el.offsetParent !== null) {
      el.click();
      return true;
    }
  }
  return false;
}

function extractUsersFromDialog(dialog: HTMLElement): InstagramUser[] {
  const users: InstagramUser[] = [];
  const seen = new Set<string>();

  const allLinks = dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const link of allLinks) {
    const href = link.getAttribute('href') || '';
    const username = href.replace(/^\//, '').replace(/\/$/, '');
    if (!username || username.includes('/') || seen.has(username)) continue;

    const row = link.closest('div[class]');
    const spans = row ? row.querySelectorAll('span') : [];
    let fullName = '';
    const img = link.closest('[class]')?.querySelector<HTMLImageElement>('img[alt]');

    for (const span of spans) {
      const txt = span.textContent?.trim() || '';
      if (txt && txt !== username && txt.length < 60 && !txt.startsWith('@')) {
        fullName = txt;
        break;
      }
    }

    seen.add(username);
    users.push({
      username,
      fullName,
      avatarUrl: img?.src || '',
    });
  }

  return users;
}

async function scrapeDialog(
  dialogLabel: 'followers' | 'following',
): Promise<InstagramUser[]> {
  const header = findHeader();
  if (!header) throw new Error('Profile not found. Navigate to your profile page.');

  const clicked = clickText(header, dialogLabel);
  if (!clicked) throw new Error(`Could not find "${dialogLabel}" link on profile`);
  await sleep(1500);

  const dialog = getVisibleDialog();
  if (!dialog) throw new Error(`${dialogLabel} dialog did not open`);

  let prevCount = 0;
  let stableRounds = 0;
  let users: InstagramUser[] = [];

  for (let i = 0; i < 60; i++) {
    await sleep(800);
    const scrollable = dialog.querySelector<HTMLElement>('div[style*="overflow"]') || dialog;
    scrollable.scrollTop = scrollable.scrollHeight;

    users = extractUsersFromDialog(dialog);
    if (users.length === prevCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    prevCount = users.length;

    if (stableRounds >= 4) break;
  }

  const closeBtn = dialog.querySelector<HTMLElement>('[aria-label="Close"]');
  if (closeBtn) {
    closeBtn.click();
  } else {
    const svgClose = dialog.querySelector<HTMLElement>('svg[aria-label="Close"]')?.parentElement;
    svgClose?.click();
  }

  return users;
}

export async function scrapeFollowers(): Promise<InstagramUser[]> {
  return scrapeDialog('followers');
}

export async function scrapeFollowing(): Promise<InstagramUser[]> {
  return scrapeDialog('following');
}
