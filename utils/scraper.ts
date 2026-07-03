import type { InstagramUser } from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Check if a string is a valid Instagram username.
 * Instagram allows alphanumeric, periods, and underscores only.
 * Used across selector strategies to filter out non-user entries (paths, query strings, etc).
 */
export function isValidUsername(str: string): boolean {
  if (str.length === 0 || str.length > 30) return false;
  if (str.startsWith('.') || str.endsWith('.')) return false;
  if (str.includes('..')) return false;
  return /^[a-zA-Z0-9._]+$/.test(str);
}

function getVisibleDialog(): HTMLElement | null {
  // Primary: offsetParent check — fastest, catches display:none and detached elements
  for (const d of document.querySelectorAll<HTMLElement>('div[role="dialog"]')) {
    if (d.offsetParent !== null) return d;
  }
  // Fallback: computed style — catches elements hidden via CSS classes, inline styles,
  // visibility:hidden, or inherited hiding. More reliable than inline-style-only selectors.
  for (const d of document.querySelectorAll<HTMLElement>('div[role="dialog"]:not([hidden])')) {
    const style = getComputedStyle(d);
    if (style.display !== 'none' && style.visibility !== 'hidden') return d;
  }
  return null;
}

function findClickableLink(text: string): HTMLElement | null {
  const lower = text.toLowerCase();

  const direct = document.querySelector<HTMLElement>(`a[href*="/${lower}/"]`);
  if (direct && direct.offsetParent !== null) return direct;

  for (const el of document.querySelectorAll<HTMLElement>(
    'a, span[role="link"], span, div[role="button"]',
  )) {
    if (el.offsetParent === null) continue;

    const href = (el as HTMLAnchorElement).href || '';
    if (href.includes(`/${lower}/`)) {
      const t = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      if (t.includes(lower)) return el;
    }

    const aria = el.getAttribute('aria-label')?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (aria.includes(lower)) return el;

    const content = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (content === lower) return el;
    if (content.startsWith(lower + ' ')) return el;
    if (content.endsWith(' ' + lower)) return el;
    if (content.includes(' ' + lower + ' ')) return el;
    if (content.includes(lower)) return el;
  }

  return null;
}

function extractUsers(dialog: HTMLElement): InstagramUser[] {
  const users: InstagramUser[] = [];
  const seen = new Set<string>();

  // Primary: anchor-based — standard Instagram dialog renders user rows
  // as <a href="/username/">. Most reliable for plain HTML dialogs.
  for (const a of dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    const href = a.getAttribute('href') || '';
    // Split off query params FIRST, then strip leading/trailing slashes.
    // Correctly handles: /username/, /username/?hl=en, /username?__d=1
    const path = href.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
    // Skip non-user paths (single segment only — Instagram usernames never contain '/')
    if (!path || path.includes('/')) continue;
    const username = path;
    if (!isValidUsername(username) || seen.has(username)) continue;

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

  // Secondary: div[role="link"] — catches virtualized rows where Instagram
  // renders users as non-anchor elements (common with React Window / Apollo).
  // These elements typically have an img[alt] with the username and span children.
  for (const el of dialog.querySelectorAll<HTMLElement>('div[role="link"]')) {
    if (el.offsetParent === null) continue;

    const img = el.querySelector<HTMLImageElement>('img[alt]');
    const spans = el.querySelectorAll('span');

    let username = '';
    let fullName = '';

    // 1. Try href-like attributes (some Instagram builds set link attribute)
    const href = el.getAttribute('href') || el.getAttribute('link') || '';
    if (href) {
      const candidate = href.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
      if (isValidUsername(candidate)) username = candidate;
    }

    // 2. Extract from img alt — Instagram formats alt as "username's profile picture"
    //    (English) or "photo de profil d'username" / "foto de perfil de username" etc.
    //    Try English format first, then scan from the end for the last valid username.
    if (!username && img?.alt) {
      // English: "username's profile picture"
      const engMatch = img.alt.match(/^([a-zA-Z0-9._]{1,30})['’\u2019]?s profile picture$/i);
      if (engMatch && isValidUsername(engMatch[1])) {
        username = engMatch[1];
      } else {
        // Non-English: username is the last word in the alt text
        const words = img.alt.split(/\s+/);
        for (let i = words.length - 1; i >= 0; i--) {
          const w = words[i].replace(/[^a-zA-Z0-9._]/g, '');
          if (isValidUsername(w)) { username = w; break; }
        }
      }
    }

    // 3. Fallback: first span is typically the username
    if (!username && spans.length > 0) {
      const t = spans[0]?.textContent?.trim() || '';
      if (isValidUsername(t)) username = t;
    }

    // Extract full name from spans (skip span matching username)
    if (spans.length > 0) {
      for (const s of spans) {
        const t = s.textContent?.trim() || '';
        if (t && t !== username && t.length < 60) {
          fullName = t;
          break;
        }
      }
    }

    if (username && isValidUsername(username) && !seen.has(username)) {
      seen.add(username);
      users.push({ username, fullName, avatarUrl: img?.src || '' });
    }
  }

  return users;
}

function getMostScrollable(element: HTMLElement): HTMLElement {
  if (element.scrollHeight > element.clientHeight + 2) return element;

  const listEl = element.querySelector<HTMLElement>('div[role="list"], ul[role="list"]');
  if (listEl && listEl.scrollHeight > listEl.clientHeight + 2) return listEl;

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

function simulateScroll(scrollable: HTMLElement): number {
  const viewport = scrollable.clientHeight;
  const before = scrollable.scrollTop;
  scrollable.scrollTop += Math.max(viewport, 100);
  // React Window / react-virtualized listens for native scroll events to
  // trigger loading the next batch. Without this dispatch, no new items render.
  scrollable.dispatchEvent(new Event('scroll', { bubbles: true }));
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
  await sleep(2500);

  const dialog = getVisibleDialog();
  if (!dialog) throw new Error(`"${kind}" dialog did not open`);

  let prev = 0;
  let stalled = 0;
  let lastHeight = 0;
  let users: InstagramUser[] = [];

  for (let i = 0; i < 200; i++) {
    await sleep(1800);
    const scrollable = getMostScrollable(dialog);
    const currentHeight = scrollable.scrollHeight;
    simulateScroll(scrollable);
    users = extractUsers(dialog);

    const noNewUsers = users.length === prev;
    const noHeightGrowth = currentHeight <= lastHeight;

    if (noNewUsers && noHeightGrowth) {
      stalled++;
    } else {
      stalled = 0;
    }
    prev = users.length;
    lastHeight = currentHeight;
    if (stalled >= 6) break;
    if (users.length === 0 && i >= 20) break;
  }

  // Verification pass: Instagram's virtualized list may still be loading the last
  // batch when the stall detector fires. Re-check after a delay and resume if new
  // items appeared. Repeat up to 3 times or until no new users.
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(2000);

    // Guard: dialog may have been closed/navigated away
    if (!getVisibleDialog()) break;

    const beforeVerify = users.length;
    users = extractUsers(dialog);
    if (users.length === beforeVerify) break;

    // New users appeared — scroll a few more rounds to load the remainder
    const scrollable = getMostScrollable(dialog);
    for (let i = 0; i < 4; i++) {
      if (!getVisibleDialog()) break;
      const prev = users.length;
      await sleep(1800);
      simulateScroll(scrollable);
      users = extractUsers(dialog);
      if (users.length === prev) break;
    }
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
