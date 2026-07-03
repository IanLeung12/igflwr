function getCsrfToken(): string {
  const cookie = document.cookie.split('; ').find((c) => c.startsWith('csrftoken='));
  return cookie ? cookie.split('=')[1] : '';
}

async function getUserId(username: string): Promise<string | null> {
  const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.instagram.com/',
    },
  });
  if (!res.ok) return null;
  const data = await res.json() as { data?: { user?: { id?: string } } };
  return data?.data?.user?.id ?? null;
}

let userIdCache = new Map<string, string>();

async function ensureUserId(username: string): Promise<string> {
  const cached = userIdCache.get(username);
  if (cached) return cached;
  const id = await getUserId(username);
  if (!id) throw new Error(`Could not resolve user ID for @${username}`);
  userIdCache.set(username, id);
  return id;
}

async function apiPost(path: string): Promise<boolean> {
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new Error('No CSRF token found. Are you logged in?');

  const res = await fetch(`https://www.instagram.com${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Referer': 'https://www.instagram.com/',
    },
    body: `csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}`,
  });

  if (!res.ok && res.status !== 200) return false;

  try {
    const body = await res.json() as { status?: string };
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

export async function apiFollow(username: string): Promise<boolean> {
  const userId = await ensureUserId(username);
  return apiPost(`/web/friendships/${userId}/follow/`);
}

export async function apiUnfollow(username: string): Promise<boolean> {
  const userId = await ensureUserId(username);
  return apiPost(`/web/friendships/${userId}/unfollow/`);
}

export async function apiRemoveFollower(username: string): Promise<boolean> {
  const userId = await ensureUserId(username);
  return apiPost(`/web/friendships/${userId}/remove_follower/`);
}

export function clearUserIdCache(): void {
  userIdCache.clear();
}
