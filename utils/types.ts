export interface InstagramUser {
  username: string;
  fullName: string;
  avatarUrl: string;
  userId?: string;
}

export type FollowStatus =
  | 'mutual'
  | 'not_following_back'
  | 'you_dont_follow_back'
  | 'unknown';

export interface UserWithStatus extends InstagramUser {
  status: FollowStatus;
  isInFollowers: boolean;
  isInFollowing: boolean;
}

export type ActionType = 'follow' | 'unfollow' | 'remove_follower';

export interface QueuedAction {
  id: string;
  type: ActionType;
  username: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp: number;
}

export type FilterType = FollowStatus | 'all';

export interface AppData {
  followers: InstagramUser[];
  following: InstagramUser[];
  users: UserWithStatus[];
  isScraping: boolean;
  scrapePhase: string;
}

export interface Settings {
  actionDelay: number;
  dailyActionLimit: number;
  safeMode: boolean;
}

export interface StorageData {
  followers: InstagramUser[];
  following: InstagramUser[];
  actionHistory: QueuedAction[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  actionDelay: 3000,
  dailyActionLimit: 50,
  safeMode: true,
};

export type ScraperTarget = 'followers' | 'following';
