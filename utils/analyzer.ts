import type { InstagramUser, UserWithStatus, FollowStatus } from './types';

export function analyzeFollowBack(
  followers: InstagramUser[],
  following: InstagramUser[],
): UserWithStatus[] {
  const followerSet = new Map<string, InstagramUser>();
  for (const u of followers) {
    followerSet.set(u.username.toLowerCase(), u);
  }

  const followingSet = new Map<string, InstagramUser>();
  for (const u of following) {
    followingSet.set(u.username.toLowerCase(), u);
  }

  const allUsernames = new Set<string>();
  for (const u of followers) allUsernames.add(u.username.toLowerCase());
  for (const u of following) allUsernames.add(u.username.toLowerCase());

  const users: UserWithStatus[] = [];

  for (const username of allUsernames) {
    const inFollowers = followerSet.has(username);
    const inFollowing = followingSet.has(username);
    const userData = followingSet.get(username) || followerSet.get(username)!;

    let status: FollowStatus;
    if (inFollowers && inFollowing) {
      status = 'mutual';
    } else if (inFollowing && !inFollowers) {
      status = 'not_following_back';
    } else {
      status = 'you_dont_follow_back';
    }

    users.push({
      ...userData,
      status,
      isInFollowers: inFollowers,
      isInFollowing: inFollowing,
    });
  }

  users.sort((a, b) => a.username.localeCompare(b.username));
  return users;
}
