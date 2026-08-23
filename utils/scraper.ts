import type { InstagramUser } from './types';
import { hasGraphQLSupport, getCurrentUsername, fetchFollowersViaAPI, fetchFollowingViaAPI } from './graphql';

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

/**
 * Instagram paths that look like usernames but are app routes, not people.
 */
const RESERVED_PATHS = new Set([
  'explore', 'reels', 'reel', 'direct', 'accounts', 'p', 'stories', 'tv',
  'about', 'legal', 'privacy', 'terms', 'developer', 'directory', 'challenge',
  'emails', 'session', 'oauth', 'graphql', 'api', 'ajax', 'web', 'settings',
  'inbox', 'archive', 'edit', 'password', 'help', 'support', 'locations',
  'topics', 'your_activity', 'notifications',
]);

/**
 * Extract a username from an Instagram profile href.
 * Returns null for anything that is not a single-segment profile path.
 * This is the only trustworthy username source: every real row in a
 * followers/following dialog is wrapped in an <a href="/username/">.
 */
export function usernameFromHref(href: string): string | null {
  if (!href) return null;
  let path = href;
  if (path.includes('://')) {
    const idx = path.indexOf('/', path.indexOf('://') + 3);
    path = idx === -1 ? '' : path.slice(idx);
  }
  path = path.split('?')[0].split('#')[0].replace(/^\//, '').replace(/\/$/, '');
  if (!path || path.includes('/')) return null;
  if (!isValidUsername(path)) return null;
  if (RESERVED_PATHS.has(path.toLowerCase())) return null;
  return path;
}

function getVisibleDialog(): HTMLElement | null {
  const allDialogs = document.querySelectorAll<HTMLElement>('div[role="dialog"]');
  console.debug(`[IG Flwr] getVisibleDialog: found ${allDialogs.length} div[role="dialog"] elements`);

  if (allDialogs.length > 0) {
    for (const d of allDialogs) {
      console.debug(`[IG Flwr] getVisibleDialog:   dialog visibility=offsetParent=${d.offsetParent !== null} display=${getComputedStyle(d).display} text="${d.textContent?.slice(0, 60).trim()}"`);
    }
  }

  // Prefer a dialog that looks like a followers/following list:
  // contains follower/following text, scrollable area, and user links
  for (const d of allDialogs) {
    if (d.offsetParent === null) continue;
    const text = d.textContent?.toLowerCase() || '';
    const isList = text.includes('followers') || text.includes('following');
    if (!isList) continue;
    const links = d.querySelectorAll('a[href^="/"]');
    const scrollable = d.querySelector('[style*="overflow"]');
    if ((scrollable || links.length > 3) && links.length > 0) {
      console.debug(`[IG Flwr] getVisibleDialog: selected via kind+scrollable/links (links=${links.length}, scrollable=${!!scrollable})`);
      return d;
    }
  }

  console.debug(`[IG Flwr] getVisibleDialog: kind-based match failed, trying offsetParent fallback`);

  for (const d of allDialogs) {
    if (d.offsetParent !== null) {
      console.debug(`[IG Flwr] getVisibleDialog: selected via offsetParent (1st visible)`);
      return d;
    }
  }

  const notHidden = document.querySelectorAll<HTMLElement>('div[role="dialog"]:not([hidden])');
  console.debug(`[IG Flwr] getVisibleDialog: offsetParent failed, computed style fallback on ${notHidden.length} non-hidden dialogs`);

  for (const d of notHidden) {
    const style = getComputedStyle(d);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      console.debug(`[IG Flwr] getVisibleDialog: selected via computed style (display=${style.display}, visibility=${style.visibility})`);
      return d;
    }
  }

  console.debug(`[IG Flwr] getVisibleDialog: no visible dialog found`);
  return null;
}

function getDialogByKind(kind: 'followers' | 'following'): HTMLElement | null {
  const kindText = kind.toLowerCase();
  const allDialogs = document.querySelectorAll<HTMLElement>('div[role="dialog"]');
  console.debug(`[IG Flwr] getDialogByKind: searching among ${allDialogs.length} dialogs for kind="${kindText}"`);

  // Find a visible dialog whose text content matches the requested kind
  for (const d of allDialogs) {
    if (d.offsetParent === null) continue;
    const style = getComputedStyle(d);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const text = d.textContent?.toLowerCase() || '';
    if (!text.includes(kindText)) continue;
    const links = d.querySelectorAll('a[href^="/"]');
    const scrollable = d.querySelector('[style*="overflow"]');
    if (scrollable || links.length > 3) {
      console.debug(`[IG Flwr] getDialogByKind: matched dialog has links=${links.length} scrollable=${!!scrollable}`);
      return d;
    }
  }

  // Fallback: any visible dialog
  console.debug(`[IG Flwr] getDialogByKind: no kind-specific match, falling back to getVisibleDialog`);
  const fallback = getVisibleDialog();
  if (fallback) console.debug(`[IG Flwr] getDialogByKind: getVisibleDialog returned a dialog`);
  else console.debug(`[IG Flwr] getDialogByKind: getVisibleDialog returned null`);
  return fallback;
}

function findClickableLink(text: string): HTMLElement | null {
  const lower = text.toLowerCase();

  console.debug(`[IG Flwr] findClickableLink: strategy=1 direct anchor a[href*="/${lower}/"]`);
  const direct = document.querySelector<HTMLElement>(`a[href*="/${lower}/"]`);
  if (direct && direct.offsetParent !== null) {
    console.debug(`[IG Flwr] findClickableLink: FOUND via direct anchor`, {
      tagName: direct.tagName,
      textContent: direct.textContent?.trim(),
      href: (direct as HTMLAnchorElement).href,
    });
    return direct;
  }
  console.debug(`[IG Flwr] findClickableLink: direct failed, strategy=2 count pattern`);

  // 2. Look for spans with a count pattern: "1,234 followers" / "1,234 following"
  //    Instagram renders these as clickable elements on the profile page header.
  const countPattern = new RegExp(`(\\d[\\d,.]*)\\s*${lower}`, 'i');
  for (const span of document.querySelectorAll<HTMLElement>('span')) {
    if (span.offsetParent === null) continue;
    if (!countPattern.test(span.textContent?.trim() || '')) continue;
    // Walk up to find the nearest clickable ancestor
    let parent: HTMLElement | null = span;
    while (parent) {
      if (parent.tagName === 'A' || parent.getAttribute('role') === 'link') {
        if (parent.offsetParent !== null) {
          console.debug(`[IG Flwr] findClickableLink: FOUND via count pattern (clickable ancestor)`, {
            tagName: parent.tagName,
            textContent: parent.textContent?.trim(),
            href: (parent as HTMLAnchorElement).href,
          });
          return parent;
        }
      }
      parent = parent.parentElement;
    }
    // If no clickable ancestor, try clicking the span itself
    console.debug(`[IG Flwr] findClickableLink: FOUND via count pattern (span itself)`, {
      tagName: span.tagName,
      textContent: span.textContent?.trim(),
    });
    return span;
  }

  console.debug(`[IG Flwr] findClickableLink: count pattern failed, strategy=3 broad search (a, span[role=link], span, div[role=button])`);

  // 3. Broad search through various clickable element types
  for (const el of document.querySelectorAll<HTMLElement>(
    'a, span[role="link"], span, div[role="button"]',
  )) {
    if (el.offsetParent === null) continue;

    const href = (el as HTMLAnchorElement).href || '';
    if (href.includes(`/${lower}/`)) {
      const t = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      if (t.includes(lower)) {
        console.debug(`[IG Flwr] findClickableLink: FOUND via broad href+text`, {
          tagName: el.tagName,
          textContent: el.textContent?.trim(),
          href,
        });
        return el;
      }
    }

    const aria = el.getAttribute('aria-label')?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (aria.includes(lower)) {
      console.debug(`[IG Flwr] findClickableLink: FOUND via broad aria-label`, {
        tagName: el.tagName,
        textContent: el.textContent?.trim(),
        ariaLabel: el.getAttribute('aria-label'),
      });
      return el;
    }

    const content = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (content === lower || content.startsWith(lower + ' ') || content.endsWith(' ' + lower) || content.includes(' ' + lower + ' ') || content.includes(lower)) {
      console.debug(`[IG Flwr] findClickableLink: FOUND via broad textContent`, {
        tagName: el.tagName,
        textContent: el.textContent?.trim(),
      });
      return el;
    }
  }

  console.debug(`[IG Flwr] findClickableLink: no match found for "${text}"`);
  return null;
}

/**
 * LAST-RESORT text scan: extracts potential usernames by scanning ALL text
 * content in the dialog when selector-based approaches fail.
 * This is a fallback for when Instagram changes their DOM structure
 * in unexpected ways and no known selectors match.
 *
 * Splits text on whitespace/delimiters, validates tokens against username
 * rules, filters common words, and checks for nearby img/anchors as context.
 * Returns minimal InstagramUser entries (fullName is always empty).
 */
export function extractUsersByTextScan(dialog: HTMLElement, existingSeen: Set<string>): InstagramUser[] {
  const users: InstagramUser[] = [];
  const seen = new Set(existingSeen);

  const commonWords = new Set([
    'the', 'de', 'la', 'el', 'en', 'y', 'e', 'a', 'o', 'u', 'si', 'no',
    'Followers', 'Following', 'Close', 'Search', 'Cancel', 'Done',
    'Profile', 'Posts', 'followers', 'following', 'close', 'search',
    'cancel', 'done', 'profile', 'posts', 'you', 'your', 'and', 'or',
    'for', 'but', 'not', 'all', 'any', 'can', 'has', 'had', 'was',
    'are', 'were', 'been', 'being', 'have', 'had', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
    'with', 'without', 'from', 'into', 'about', 'over', 'after',
    'before', 'between', 'under', 'above', 'below', 'out', 'off',
    'on', 'at', 'by', 'to', 'in', 'it', 'is', 'be', 'this', 'that',
    'these', 'those', 'am', 'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'do', 'did', 'does', 'but', 'if', 'or',
    'because', 'as', 'until', 'while', 'of', 'by', 'for', 'with',
    'about', 'against', 'between', 'through', 'during', 'before',
    'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'also', 'now', 'even', 'still', 'already',
    'quite', 'rather', 'well', 'really', 'almost', 'hardly', 'nearly',
    'completely', 'absolutely', 'entirely', 'totally', 'simply',
    'basically', 'actually', 'definitely', 'certainly', 'surely',
    'probably', 'possibly', 'maybe', 'perhaps', 'likely', 'unlikely',
    'never', 'always', 'often', 'usually', 'sometimes', 'rarely',
    'seldom', 'frequently', 'occasionally', 'regularly', 'typically',
    'copy', 'link', 'share', 'report', 'block', 'unfollow', 'mute',
    'restrict', 'translate', 'embed', 'remove', 'view', 'edit', 'delete',
  ]);

  const allText = dialog.textContent || dialog.innerText || '';
  const tokens = allText.split(/[\s,;|/\\()\[\]{}<>«»""'']+/);

  // Pre-walk the DOM to find all text nodes and their parent ancestry
  // for fast context lookup during token scanning.
  const textNodeParents: Map<string, HTMLElement[]> = new Map();
  {
    const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const existing = textNodeParents.get(text) || [];
      existing.push(parent);
      textNodeParents.set(text, existing);
    }
  }

  for (const token of tokens) {
    const cleaned = token.replace(/^[^a-zA-Z0-9._]+/, '').replace(/[^a-zA-Z0-9._]+$/, '');
    if (!cleaned || cleaned.length < 2 || cleaned.length > 30) continue;
    if (!isValidUsername(cleaned)) continue;
    const lower = cleaned.toLowerCase();
    if (commonWords.has(cleaned) || commonWords.has(lower)) continue;
    if (seen.has(cleaned)) continue;

    // Find context: look for text nodes containing this token and check
    // their parent hierarchy for img or anchor elements
    let hasContext = false;
    let avatarUrl = '';

    const parents = textNodeParents.get(cleaned) || [];
    for (const parent of parents) {
      let current: HTMLElement | null = parent;
      for (let level = 0; current && level < 4; level++) {
        const anchor = current.querySelector<HTMLAnchorElement>(`a[href^="/${cleaned}"]`);
        if (anchor) {
          hasContext = true;
          const img = anchor.querySelector<HTMLImageElement>('img[alt]')
            || current.querySelector<HTMLImageElement>('img[alt]');
          if (img?.src) avatarUrl = img.src;
          break;
        }

        const img = current.querySelector<HTMLImageElement>(`img[alt*="${cleaned}"]`);
        if (img) {
          hasContext = true;
          if (img?.src) avatarUrl = img.src;
          break;
        }

        const anyImg = current.querySelector<HTMLImageElement>('img');
        const hasAnchorNearby = current.querySelector('a');
        if (anyImg || hasAnchorNearby) {
          hasContext = true;
          if (anyImg?.src) avatarUrl = anyImg.src;
          break;
        }

        current = current.parentElement;
      }
      if (hasContext) break;
    }

    if (!hasContext) continue;

    seen.add(cleaned);
    users.push({ username: cleaned, fullName: '', avatarUrl });
  }

  console.debug(`[IG Flwr] extractUsersByTextScan: ${users.length} users from text scan`);
  return users;
}

function extractUserFromElement(el: HTMLElement): InstagramUser | null {
  let username = '';
  let fullName = '';
  let avatarUrl = '';

  const container: HTMLElement = (() => {
    if (el.tagName === 'IMG') return el.parentElement || el;
    if (el.tagName === 'A') {
      return (
        el.closest<HTMLElement>(
          'div[style], div[role="link"], div[class*="x9f619"], div[class*="xt0psk2"]',
        ) ||
        el.parentElement ||
        el
      );
    }
    return el;
  })();

  const img =
    el.tagName === 'IMG'
      ? (el as HTMLImageElement)
      : container.querySelector<HTMLImageElement>('img[alt]') ||
        container.querySelector<HTMLImageElement>('img');
  if (img?.src) avatarUrl = img.src;

  const spans = container.querySelectorAll('span');

  // 1: href / link attribute
  const href =
    (el as HTMLAnchorElement).href ||
    el.getAttribute('href') ||
    el.getAttribute('link') ||
    '';
  if (href) {
    const path = href.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
    if (path && !path.includes('/') && isValidUsername(path)) {
      username = path;
    }
  }

  // 2: img alt text
  if (!username && img?.alt) {
    const engMatch = img.alt.match(
      /^([a-zA-Z0-9._]{1,30})['\u2019]?s profile picture$/i,
    );
    if (engMatch && isValidUsername(engMatch[1])) {
      username = engMatch[1];
    } else {
      const words = img.alt.split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i].replace(/[^a-zA-Z0-9._]/g, '');
        if (isValidUsername(w)) {
          username = w;
          break;
        }
      }
    }
  }

  // 3: aria-label
  if (!username) {
    const aria = el.getAttribute('aria-label') || '';
    if (aria) {
      const words = aria.split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i].replace(/[^a-zA-Z0-9._]/g, '');
        if (isValidUsername(w)) {
          username = w;
          break;
        }
      }
    }
  }

  // 4: data-* attributes
  if (!username) {
    for (const attr of el.getAttributeNames()) {
      if (!attr.startsWith('data-')) continue;
      const val = el.getAttribute(attr) || '';
      if (!val) continue;
      const path = val.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
      if (path && !path.includes('/') && isValidUsername(path)) {
        username = path;
        break;
      }
      const words = val.split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i].replace(/[^a-zA-Z0-9._]/g, '');
        if (isValidUsername(w)) {
          username = w;
          break;
        }
      }
      if (username) break;
    }
  }

  // 5: title attribute
  if (!username) {
    const title = el.getAttribute('title') || container.getAttribute('title') || '';
    if (title) {
      const words = title.split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        const w = words[i].replace(/[^a-zA-Z0-9._]/g, '');
        if (isValidUsername(w)) {
          username = w;
          break;
        }
      }
    }
  }

  // 6: direct child span (only if container has img or anchor — likely a user row)
  if (!username && (img || container.querySelector('a'))) {
    for (const s of container.querySelectorAll(':scope > span')) {
      const t = s.textContent?.trim() || '';
      if (isValidUsername(t) && t.length <= 30) {
        username = t;
        break;
      }
    }
  }

  // 7: any descendant span (only if container has img or anchor)
  if (!username && (img || container.querySelector('a'))) {
    for (const s of spans) {
      const t = s.textContent?.trim() || '';
      if (
        t &&
        isValidUsername(t) &&
        t.length <= 30 &&
        !t.startsWith('@') &&
        !t.includes(' ')
      ) {
        username = t;
        break;
      }
    }
  }

  // Full name from spans
  for (const s of spans) {
    const t = s.textContent?.trim() || '';
    if (t && t !== username && t.length < 60 && !t.startsWith('@')) {
      fullName = t;
      break;
    }
  }

  if (username && isValidUsername(username)) {
    return { username, fullName, avatarUrl };
  }
  return null;
}

/**
 * Instagram shows "Suggested for you" (or similar) at the bottom of followers/following dialogs.
 * These are not actual followers/following. Detect the boundary element so we can skip them.
 */
const SUGGESTION_HEADERS = [
  'suggested for you',
  'suggestions for you',
  'you might like',
  'people you might know',
  'discover people',
  'more suggestions',
  'recommended for you',
  'follow suggestions',
  'suggested accounts',
  'similar accounts',
];

function findSuggestedBoundary(dialog: HTMLElement): Element | null {
  for (const textEl of dialog.querySelectorAll<HTMLElement>(
    'span, div, h1, h2, h3, h4, h5, h6, p, strong, b, label',
  )) {
    const text = textEl.textContent?.toLowerCase().trim() || '';
    if (!text || text.length > 40) continue;
    if (SUGGESTION_HEADERS.some(h => text.includes(h))) {
      console.debug(`[IG Flwr] findSuggestedBoundary: found "${text.slice(0, 40)}"`, {
        tagName: textEl.tagName,
        className: textEl.className,
      });
      return textEl;
    }
  }
  return null;
}

/**
 * The dialog is more than the list: it also holds a title bar, a search box
 * and (at the bottom) any "Suggested" section. Only the scrollable list
 * container holds actual followers/following rows, so extraction is scoped
 * to it. Falls back to the whole dialog if no scrollable child is found.
 */
function getListRoot(dialog: HTMLElement): HTMLElement {
  let best: HTMLElement | null = null;
  let bestDelta = 0;
  for (const child of dialog.querySelectorAll<HTMLElement>('*')) {
    if (!canScroll(child)) continue;
    const delta = child.scrollHeight - child.clientHeight;
    if (delta > bestDelta) { bestDelta = delta; best = child; }
  }
  return best || dialog;
}

/**
 * Username of the profile being scraped. Captured before the dialog opens
 * (the URL changes once it does) and excluded from results: you can never
 * be your own follower, but your own avatar/link can appear in the chrome
 * around the list.
 */
let profileOwner: string | null = null;

function extractUsers(dialog: HTMLElement): InstagramUser[] {
  const users: InstagramUser[] = [];
  const seen = new Set<string>();
  const suggestionBoundary = findSuggestedBoundary(dialog);
  const listRoot = getListRoot(dialog);
  const owner = profileOwner?.toLowerCase() || null;

  function isBeforeSuggestion(el: HTMLElement): boolean {
    if (!suggestionBoundary) return true;
    return (el.compareDocumentPosition(suggestionBoundary) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  }

  function add(user: InstagramUser | null, el: HTMLElement): void {
    if (user && !seen.has(user.username) && isBeforeSuggestion(el)) {
      seen.add(user.username);
      users.push(user);
    }
  }

  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, s6 = 0, s7 = 0, s8 = 0;

  // 1: PRIMARY - anchor hrefs. Every genuine user row in the dialog is
  // wrapped in <a href="/username/">, so this is the only source we trust.
  // Display names, alt text and bare spans are NOT usernames; using them as
  // primary sources produced hundreds of phantom entries.
  for (const el of listRoot.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    s1++;
    const href = el.getAttribute('href') || '';
    const username = usernameFromHref(href);
    if (!username) {
      // Surface the one way this filter can be wrong: a real account whose
      // name collides with a reserved path. Silent here would look like an
      // off-by-one in the final count.
      const raw = href.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
      if (raw && !raw.includes('/') && isValidUsername(raw) && RESERVED_PATHS.has(raw.toLowerCase())) {
        console.debug(`[IG Flwr] extractUsers: skipped reserved-path link inside the list: /${raw}/`);
      }
      continue;
    }
    if (seen.has(username)) continue;
    if (owner && username.toLowerCase() === owner) continue;

    const row =
      el.closest<HTMLElement>('li, div[role="listitem"]') ||
      el.parentElement?.parentElement ||
      el;

    let fullName = '';
    for (const sp of row.querySelectorAll('span')) {
      const t = sp.textContent?.trim() || '';
      if (!t || t === username || t.length >= 60) continue;
      if (t.startsWith('@') || isSuspiciousKeyword(t.toLowerCase())) continue;
      fullName = t;
      break;
    }

    const img = row.querySelector<HTMLImageElement>('img');
    add({ username, fullName, avatarUrl: img?.src || '' }, el);
  }

  // Strategies 2-8 are DOM-change fallbacks only. They match generic layout
  // divs and will happily turn a full name into a "username", so they run
  // only when the anchor pass found nothing at all.
  if (users.length === 0) {
    // 2: role-based links
    for (const el of dialog.querySelectorAll<HTMLElement>('div[role="link"]')) {
      add(extractUserFromElement(el), el); s2++;
    }

    // 3: Instagram 2024+ common user row class
    for (const el of dialog.querySelectorAll<HTMLElement>('div[class*="x9f619"]')) {
      add(extractUserFromElement(el), el); s3++;
    }

    // 4: another common Instagram user row class
    for (const el of dialog.querySelectorAll<HTMLElement>('div[class*="xt0psk2"]')) {
      add(extractUserFromElement(el), el); s4++;
    }

    // 5: profile-picture img alt (walk up to parent row)
    for (const el of dialog.querySelectorAll<HTMLImageElement>(
      'img[alt*="profile picture"]',
    )) {
      const parent = el.parentElement || el;
      add(extractUserFromElement(parent), parent); s5++;
    }

    // 6: test-id based selectors
    for (const el of dialog.querySelectorAll<HTMLElement>(
      'div[data-testid="user-avatar"], [data-testid*="user"], [data-testid*="avatar"]',
    )) {
      add(extractUserFromElement(el), el); s6++;
    }

    // 7: span+span pattern where first is username, second is full name
    for (const el of dialog.querySelectorAll<HTMLElement>(
      'div, a, span[role="link"], li',
    )) {
      if (!isBeforeSuggestion(el)) continue;
      const childSpans = el.querySelectorAll(':scope > span');
      if (childSpans.length < 2) continue;
      const first = childSpans[0]?.textContent?.trim() || '';
      const second = childSpans[1]?.textContent?.trim() || '';
      if (
        first &&
        second &&
        isValidUsername(first) &&
        first.length <= 30 &&
        !first.includes(' ') &&
        !first.startsWith('@') &&
        second.length < 60 &&
        second !== first &&
        !seen.has(first)
      ) {
        const img = el.querySelector<HTMLImageElement>('img');
        seen.add(first);
        users.push({
          username: first,
          fullName: second,
          avatarUrl: img?.src || '',
        }); s7++;
      }
    }

    // 8: virtual scroller patterns
    for (const el of dialog.querySelectorAll<HTMLElement>(
      'div[role="presentation"] > div, ' +
        'div[style*="transform"], ' +
        'div[class*="x1cy8zhl"], ' +
        'div[class*="x78zum5"], ' +
        'div[class*="x1q0q8m5"]',
    )) {
      add(extractUserFromElement(el), el); s8++;
    }
  }

  // Last resort: text scan. Loosest strategy of all - it guesses usernames
  // from raw text - so it only runs when every selector strategy came up empty.
  if (users.length === 0 && !suggestionBoundary) {
    const scanned = extractUsersByTextScan(dialog, seen);
    for (const u of scanned) {
      if (!seen.has(u.username)) {
        seen.add(u.username);
        users.push(u);
      }
    }
  }

  if (listRoot !== dialog) {
    const strays = new Set<string>();
    for (const el of dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
      if (listRoot.contains(el)) continue;
      const u = usernameFromHref(el.getAttribute('href') || '');
      if (u) strays.add(u);
    }
    if (strays.size > 0) {
      console.debug(`[IG Flwr] extractUsers: ${strays.size} profile link(s) OUTSIDE the list container (excluded): ${[...strays].join(', ')}`);
    }
  }

  console.debug(`[IG Flwr] extractUsers: ${users.length} total | s1=${s1} s2=${s2} s3=${s3} s4=${s4} s5=${s5} s6=${s6} s7=${s7} s8=${s8}${suggestionBoundary ? ' (suggested filtered)' : ''}`);

  return users;
}

function canScroll(el: HTMLElement): boolean {
  const o = getComputedStyle(el).overflowY;
  return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 2;
}

function getScrollableContainer(dialog: HTMLElement): HTMLElement[] {
  const candidates: HTMLElement[] = [];

  if (canScroll(dialog)) candidates.push(dialog);

  const listEl = dialog.querySelector<HTMLElement>('div[role="list"], ul[role="list"]');
  if (listEl && canScroll(listEl)) candidates.push(listEl);

  for (const child of dialog.querySelectorAll<HTMLElement>('*')) {
    if (canScroll(child) && !candidates.includes(child)) candidates.push(child);
  }

  // Fallback: elements with the largest overflow delta (even if overflow style is wrong)
  let bestDelta = 0;
  let best = dialog;
  for (const child of dialog.querySelectorAll<HTMLElement>('*')) {
    const delta = child.scrollHeight - child.clientHeight;
    if (delta > bestDelta) { bestDelta = delta; best = child; }
  }
  if (!candidates.includes(best)) candidates.push(best);

  console.debug(`[IG Flwr] getScrollableContainer: ${candidates.length} candidate(s)`);
  for (const c of candidates) {
    const s = getComputedStyle(c);
    console.debug(`[IG Flwr]   <${c.tagName.toLowerCase()}> class="${c.className}" overflowY=${s.overflowY} scrollHeight=${c.scrollHeight} clientHeight=${c.clientHeight}`);
  }

  return candidates;
}

function simulatePageDown(target: HTMLElement): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'PageDown',
    code: 'PageDown',
    keyCode: 34,
    which: 34,
    bubbles: true,
  }));
}

function simulateArrowDown(target: HTMLElement): void {
  for (let i = 0; i < 5; i++) {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
    }));
  }
}

function simulateWheelScroll(target: HTMLElement): void {
  target.dispatchEvent(new WheelEvent('wheel', {
    deltaY: target.clientHeight,
    bubbles: true,
    cancelable: true,
  }));
}

function simulateScroll(candidates: HTMLElement[]): void {
  for (const el of candidates) {
    const viewport = el.clientHeight;
    const before = el.scrollTop;
    el.scrollTop += Math.max(viewport * 1.5, 100);
    if (el.scrollTop !== before) {
      // Some virtual scrollers (react-window, react-virtuoso) listen for
      // native UI events. Dispatch both Event and WheelEvent to cover them.
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: viewport }));
    }
  }
}

function simulateAllScrollMethods(candidates: HTMLElement[]): void {
  for (const el of candidates) {
    const viewport = el.clientHeight;
    const before = el.scrollTop;

    // 1. Programmatic scrollTop change (existing logic)
    el.scrollTop += Math.max(viewport * 1.5, 100);
    if (el.scrollTop !== before) {
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    // 2. WheelEvent dispatch (mouse wheel simulation)
    simulateWheelScroll(el);

    // 3. KeyboardEvent dispatch — PageDown
    simulatePageDown(el);

    // 4. KeyboardEvent dispatch — ArrowDown (5 times)
    simulateArrowDown(el);
  }
}

function afterScroll(): Promise<void> {
  // Yield to give React's render cycle a chance to commit new items
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function scrollAndWaitForMutation(
  dialog: HTMLElement,
  candidates: HTMLElement[],
  timeoutMs: number,
): Promise<number> {
  const target = dialog.querySelector<HTMLElement>('[role="list"]') || dialog;

  return new Promise(resolve => {
    let mutations = 0;

    const observer = new MutationObserver(() => {
      mutations++;
      observer.disconnect();
      resolve(mutations);
    });

    observer.observe(target, { childList: true, subtree: true });
    simulateAllScrollMethods(candidates);

    setTimeout(() => {
      observer.disconnect();
      resolve(0);
    }, timeoutMs);
  });
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
  const startTime = Date.now();
  console.log(`[IG Flwr] Scrape started at ${new Date().toISOString()}, kind: ${kind}`);

  // Capture before clicking: opening the dialog rewrites the URL to
  // /<owner>/followers/, which breaks the path-based username fallback.
  profileOwner = getCurrentUsername();
  console.debug(`[IG Flwr] Profile owner: ${profileOwner ?? '(unknown)'}`);

  // Prefer GraphQL API — faster and gets ALL users without scrolling
  const apiUser = getCurrentUsername();
  const apiSupported = hasGraphQLSupport();
  console.debug(`[IG Flwr] API check: username=${apiUser}, hasCSRF=${apiSupported}`);
  if (apiUser && apiSupported) {
    try {
      const apiFn = kind === 'followers' ? fetchFollowersViaAPI : fetchFollowingViaAPI;
      const users = await apiFn(apiUser);
      console.log(`[IG Flwr] Fetched ${users.length} ${kind} via API`);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[IG Flwr] Scrape ended: ${users.length} users in ${elapsed}s, kind=${kind} (via API)`);
      return users;
    } catch (err) {
      console.warn(`[IG Flwr] API fetch failed, falling back to DOM:`, err);
    }
  }

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

  const dialog = getDialogByKind(kind);
  if (!dialog) throw new Error(`"${kind}" dialog did not open`);

  let prev = 0;
  let stalled = 0;
  let lastHeight = 0;
  const allSeen = new Set<string>();
  const accumulated: InstagramUser[] = [];
  const scrollCandidates = getScrollableContainer(dialog);
  let exitReason = 'iteration cap (500)';

  for (let i = 0; i < 500; i++) {
    // Measure height BEFORE scrolling, compare to previous iteration's measurement
    const currentHeight = Math.max(...scrollCandidates.map(e => e.scrollHeight));
    const noHeightGrowth = currentHeight <= lastHeight;
    lastHeight = currentHeight;

    const countBefore = accumulated.length;
    const mutations = await scrollAndWaitForMutation(dialog, scrollCandidates, 3000);

    // Don't overwrite — accumulate. React Window recycles DOM nodes, so only
    // ~15-20 elements are visible at any time. Previous batches get replaced.
    for (const u of extractUsers(dialog)) {
      const key = u.username.toLowerCase();
      if (!allSeen.has(key)) {
        allSeen.add(key);
        accumulated.push(u);
      }
    }

    const noNewUsers = accumulated.length === countBefore;
    prev = accumulated.length;

    if (i < 5 || (i > 0 && i % 50 === 0)) {
      console.debug(`[IG Flwr] Iteration ${i}: accumulated=${accumulated.length} height=${currentHeight} stalled=${stalled} mutations=${mutations} newUsers=${!noNewUsers} heightGrowth=${!noHeightGrowth}`);
    }

    if (noNewUsers && mutations === 0 && noHeightGrowth) {
      stalled++;
      if (stalled >= 12) {
        exitReason = 'stall detection';
        console.debug(`[IG Flwr] Stall threshold reached (stalled=${stalled}), breaking`);
        break;
      }
    } else {
      stalled = 0;
    }
    if (accumulated.length === 0 && i >= 20) {
      exitReason = 'empty after 20 iterations';
      console.debug(`[IG Flwr] No users after 20 iterations, breaking`);
      break;
    }
  }

  console.debug(`[IG Flwr] Main loop ended: reason=${exitReason}, users=${accumulated.length}`);

  // Post-loop suggestion filter: re-check DOM for suggestion boundary.
  // Covers the edge case where suggested users were loaded in the same iteration
  // the boundary appeared but before it was rendered.
  const mainBoundary = getVisibleDialog() ? findSuggestedBoundary(dialog) : null;
  if (mainBoundary) {
    const before = accumulated.length;
    const cleanUsers: InstagramUser[] = [];
    const cleanSeen = new Set<string>();
    // Re-extract from current dialog to get only pre-boundary users
    const currentClean = extractUsers(dialog);
    const currentNames = new Set(currentClean.map(u => u.username.toLowerCase()));
    // Keep accumulated users whose usernames are still in the clean set,
    // plus any that weren't rendered this iteration (scrolled out of view)
    // but that we know aren't suspicious based on keyword check
    for (const u of accumulated) {
      const key = u.username.toLowerCase();
      if (currentNames.has(key) || !isSuspiciousKeyword(key)) {
        if (!cleanSeen.has(key)) {
          cleanSeen.add(key);
          cleanUsers.push(u);
        }
      }
    }
    const removed = before - cleanUsers.length;
    if (removed > 0) {
      console.warn(`[IG Flwr] Post-loop suggestion filter removed ${removed} users (was ${before}, now ${cleanUsers.length})`);
      accumulated.length = 0;
      accumulated.push(...cleanUsers);
      allSeen.clear();
      for (const u of cleanUsers) allSeen.add(u.username.toLowerCase());
    }
  }

  // Verification pass: up to 30s of additional waiting with periodic checks.
  // Instagram may be loading the final batch via a slow API call.
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(5000);
    if (!getVisibleDialog()) {
      console.debug(`[IG Flwr] Verification pass: dialog closed, breaking`);
      break;
    }

    // Re-check scroll candidates (dialog may have mutated)
    const vCandidates = getScrollableContainer(dialog);
    simulateAllScrollMethods(vCandidates);
    await afterScroll();

    const beforeVerify = accumulated.length;
    for (const u of extractUsers(dialog)) {
      const key = u.username.toLowerCase();
      if (!allSeen.has(key)) {
        allSeen.add(key);
        accumulated.push(u);
      }
    }
    const foundMore = accumulated.length > beforeVerify;
    console.debug(`[IG Flwr] Verification attempt ${attempt + 1}: found ${accumulated.length - beforeVerify} new users`);
    if (!foundMore) break;

    // New users appeared — keep scrolling
    for (let i = 0; i < 4; i++) {
      if (!getVisibleDialog()) break;
      const before = accumulated.length;
      await sleep(1800);
      simulateAllScrollMethods(vCandidates);
      await afterScroll();
      for (const u of extractUsers(dialog)) {
        const key = u.username.toLowerCase();
        if (!allSeen.has(key)) {
          allSeen.add(key);
          accumulated.push(u);
        }
      }
      if (accumulated.length === before) break;
    }
  }

  await closeDialog();

  // Final dedup by lowercase username (safety net)
  const deduped = new Map<string, InstagramUser>();
  for (const u of accumulated) {
    const key = u.username.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, u);
    }
  }
  const result = [...deduped.values()];

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[IG Flwr] Scrape ended: ${accumulated.length} accumulated, ${result.length} deduped, in ${elapsed}s, kind=${kind}, exitReason=${exitReason}`);
  if (result.length !== accumulated.length) {
    console.warn(`[IG Flwr] 🔴 Dedup removed ${accumulated.length - result.length} duplicates!`);
  }
  return result;
}

export async function scrapeFollowers(): Promise<InstagramUser[]> {
  return scrapeDialog('followers');
}

export async function scrapeFollowing(): Promise<InstagramUser[]> {
  return scrapeDialog('following');
}

const SUSPICIOUS_KEYWORDS = new Set([
  'follow', 'follows', 'followed', 'following',
  'unfollow', 'remove', 'message', 'cancel', 'done',
  'close', 'search', 'share', 'report', 'block',
  'mute', 'restrict', 'translate', 'embed', 'copy',
  'link', 'view', 'edit', 'delete', 'save',
  'requested', 'pending', 'accept', 'decline',
  'posts', 'profile', 'settings', 'activity',
  'switch', 'logout', 'help', 'about', 'privacy',
  'terms', 'cookies', 'feedback', 'suggested',
]);

export function isSuspiciousKeyword(lower: string): boolean {
  return SUSPICIOUS_KEYWORDS.has(lower);
}

export function findSuspiciousUsers(
  users: InstagramUser[],
  expectedCount?: number,
  filterResults?: boolean,
): { suspicious: InstagramUser[]; clean: InstagramUser[]; summary: string } {
  const suspicious: InstagramUser[] = [];
  const clean: InstagramUser[] = [];
  for (const u of users) {
    const lower = u.username.toLowerCase();
    if (
      SUSPICIOUS_KEYWORDS.has(lower) ||
      u.fullName && SUSPICIOUS_KEYWORDS.has(u.fullName.toLowerCase()) ||
      lower.includes('..') ||
      /[@+*#%=]/.test(lower)
    ) {
      suspicious.push(u);
    } else {
      clean.push(u);
    }
  }

  const parts: string[] = [];
  if (expectedCount !== undefined && users.length !== expectedCount) {
    const diff = users.length - expectedCount;
    const sign = diff > 0 ? '+' : '';
    parts.push(`expected ${expectedCount}, got ${users.length} (${sign}${diff})`);
  }
  if (suspicious.length > 0) {
    parts.push(`${suspicious.length} suspicious: ${suspicious.map(u => u.username).join(', ')}`);
  } else if (expectedCount !== undefined && users.length !== expectedCount) {
    const diff = users.length - expectedCount;
    if (diff > 5) {
      parts.push(`no suspicious usernames — likely Instagram "Suggested" section was mixed in`);
    } else if (diff < 0) {
      parts.push(`Instagram's own count includes deactivated/deleted accounts that never render as rows`);
    } else {
      parts.push(`within normal drift of Instagram's own count`);
    }
  }
  return { suspicious, clean: filterResults ? clean : users, summary: parts.join(' | ') };
}

export function getProfileCounts(): { followers: number; following: number } {
  let followers = 0;
  let following = 0;
  const pattern = /(\d[\d,.]*)\s*(follower|following)s?\b/i;
  for (const el of document.querySelectorAll<HTMLElement>('a, span, div')) {
    if (el.offsetParent === null) continue;
    const text = el.textContent?.trim();
    if (!text) continue;
    const m = text.match(pattern);
    if (!m) continue;
    const count = parseInt(m[1].replace(/[,.]/g, ''), 10);
    if (isNaN(count)) continue;
    const kind = m[2].toLowerCase();
    if (kind === 'follower' && count > followers) followers = count;
    if (kind === 'following' && count > following) following = count;
  }
  console.log(`[IG Flwr] Profile counts from page: ${followers} followers, ${following} following`);
  return { followers, following };
}
