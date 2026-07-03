import type { InstagramUser } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getVisibleDialog(): HTMLElement | null {
  for (const d of document.querySelectorAll<HTMLElement>('div[role="dialog"]')) {
    if (d.offsetParent !== null) return d;
  }
  return null;
}

function findClickableLink(text: string): HTMLElement | null {
  const lower = text.toLowerCase();
  const suffix = `/${lower}/`;

  for (const el of document.querySelectorAll<HTMLElement>(
    'a, span[role="link"], span, div[role="button"]',
  )) {
    if (el.offsetParent === null) continue;

    const href = (el as HTMLAnchorElement).href || '';
    if (href.includes(suffix)) return el;

    const content = el.textContent?.toLowerCase().trim() || '';
    if (content === lower) return el;
    if (content.startsWith(lower + ' ')) return el;
    if (content.endsWith(' ' + lower)) return el;
    if (content.includes(lower)) return el;
  }
  return null;
}

function extractUsers(dialog: HTMLElement): InstagramUser[] {
  const users: InstagramUser[] = [];
  const seen = new Set<string>();

  for (const a of dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    const href = a.getAttribute('href') || '';
    const username = href.replace(/^\//, '').replace(/\/$/, '').split('?')[0];
    if (!username || username.includes('/') || seen.has(username)) continue;

    const row = a.closest('div[style]') || a.parentElement;
    const spans = row?.querySelectorAll('span') || [];
    const img = row?.querySelector<HTMLImageElement>('img[alt]');
    let fullName = '';

    for (const s of spans) {
      const t = s.textContent?.trim() || '';
      if (t && t !== username && t.length < 60 && !t.startsWith('@')) {
        fullName = t;
        break;
      }
    }

    seen.add(username);
    users.push({ username, fullName, avatarUrl: img?.src || '' });
  }

  return users;
}

function getMostScrollable(element: HTMLElement): HTMLElement {
  let best = element;
  let bestDelta = 0;
  for (const child of element.querySelectorAll<HTMLElement>('*')) {
    const delta = child.scrollHeight - child.clientHeight;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = child;
    }
  }
  return best;
}

function simulateScroll(element: HTMLElement): number {
  const scrollable = getMostScrollable(element);
  const viewport = scrollable.clientHeight;
  const before = scrollable.scrollTop;
  scrollable.scrollTop += Math.max(viewport - 60, 100);
  return scrollable.scrollTop - before;
}

function triggerClick(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

async function closeDialog(): Promise<void> {
  const btn = document.querySelector<HTMLElement>('[aria-label="Close"]');
  if (btn) { triggerClick(btn); await sleep(300); return; }
  const svgParent = document.querySelector('svg[aria-label="Close"]')?.parentElement;
  if (svgParent) { triggerClick(svgParent); await sleep(300); return; }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await sleep(300);
}

async function scrapeDialog(
  kind: 'followers' | 'following',
): Promise<InstagramUser[]> {
  let target = findClickableLink(kind);
  if (!target) {
    const fallback = document.querySelector<HTMLElement>(`a[href*="/${kind}/"]`);
    if (fallback?.offsetParent !== null) target = fallback;
  }
  if (!target) {
    throw new Error(
      `Could not find "${kind}" on this page. Ensure you are on your Instagram profile page.`,
    );
  }
  console.log('[IG Flwr] Clicking element:', target.tagName, target.textContent?.trim());

  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(2000);

  const dialog = getVisibleDialog();
  if (!dialog) throw new Error(`"${kind}" dialog did not open`);

  let prev = 0;
  let stalled = 0;
  let users: InstagramUser[] = [];

  for (let i = 0; i < 120; i++) {
    await sleep(1400);
    const moved = simulateScroll(dialog);
    users = extractUsers(dialog);

    if (users.length === prev && moved < 10) {
      stalled++;
    } else {
      stalled = 0;
    }
    prev = users.length;
    if (stalled >= 4) break;
  }

  await closeDialog();
  return users;
}

export async function scrapeFollowers(): Promise<InstagramUser[]> {
  return scrapeDialog('followers');
}

export async function scrapeFollowing(): Promise<InstagramUser[]> {
  return scrapeDialog('following');
}
