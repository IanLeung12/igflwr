import type { InstagramUser } from './types';

function getCsrfToken(): string {
  const cookie = document.cookie.split('; ').find((c) => c.startsWith('csrftoken='));
  return cookie ? cookie.split('=')[1] : '';
}

function getUserIdFromPage(): string | null {
  try {
    const initial = (window as any).__INITIAL_STATE__;
    if (initial?.viewer?.id) return initial.viewer.id;
    if (initial?.user?.id) return initial.user.id;
  } catch {}
  return null;
}

function getCurrentUsernameFromPage(): string | null {
  try {
    const initial = (window as any).__INITIAL_STATE__;
    if (initial?.viewer?.username) return initial.viewer.username;
  } catch {}
  return null;
}

let userIdCache = new Map<string, string>();

async function resolveUserId(username: string): Promise<string | null> {
  const cached = userIdCache.get(username);
  if (cached) return cached;

  const fromPage = getUserIdFromPage();
  if (fromPage) {
    userIdCache.set(username, fromPage);
    return fromPage;
  }

  const res = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
    {
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/',
      },
    },
  );
  if (!res.ok) return null;
  const data = await res.json() as { data?: { user?: { id?: string } } };
  const id = data?.data?.user?.id ?? null;
  if (id) userIdCache.set(username, id);
  return id;
}

interface UserNode {
  pk: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
}

interface FollowListResponse {
  users: UserNode[];
  next_max_id?: string;
  big_list?: boolean;
  page_size?: number;
  has_more?: boolean;
}

async function fetchFollowList(
  userId: string,
  kind: 'followers' | 'following',
  maxId?: string,
): Promise<FollowListResponse | null> {
  const csrfToken = getCsrfToken();
  if (!csrfToken) return null;

  let url = `https://www.instagram.com/api/v1/friendships/${userId}/${kind}/`;
  if (maxId) {
    url += `?max_id=${encodeURIComponent(maxId)}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
      'Referer': 'https://www.instagram.com/',
    },
  });

  if (!res.ok) return null;
  return res.json() as Promise<FollowListResponse>;
}

async function collectAllPages(
  userId: string,
  kind: 'followers' | 'following',
): Promise<InstagramUser[]> {
  const all: InstagramUser[] = [];
  const seen = new Set<string>();
  let maxId: string | undefined;
  const MAX_PAGES = 200;

  for (let i = 0; i < MAX_PAGES; i++) {
    const data = await fetchFollowList(userId, kind, maxId);
    if (!data) break;

    for (const u of data.users) {
      if (!seen.has(u.username)) {
        seen.add(u.username);
        all.push({
          username: u.username,
          fullName: u.full_name,
          avatarUrl: u.profile_pic_url,
          userId: u.pk,
        });
      }
    }

    if (data.has_more && data.next_max_id) {
      maxId = data.next_max_id;
    } else {
      break;
    }
  }

  return all;
}

export async function fetchFollowersViaAPI(username: string): Promise<InstagramUser[]> {
  const userId = await resolveUserId(username);
  if (!userId) throw new Error(`Could not resolve user ID for @${username}`);
  return collectAllPages(userId, 'followers');
}

export async function fetchFollowingViaAPI(username: string): Promise<InstagramUser[]> {
  const userId = await resolveUserId(username);
  if (!userId) throw new Error(`Could not resolve user ID for @${username}`);
  return collectAllPages(userId, 'following');
}

export function getCurrentUsername(): string | null {
  const fromPage = getCurrentUsernameFromPage();
  if (fromPage) return fromPage;
  const match = window.location.pathname.match(/^\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

export function hasGraphQLSupport(): boolean {
  return !!getCsrfToken();
}
