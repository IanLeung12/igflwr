import React from 'react';
import type { UserWithStatus } from '../utils/types';

interface StatsBarProps {
  users: UserWithStatus[];
}

export function StatsBar({ users }: StatsBarProps) {
  const mutual = users.filter((u) => u.status === 'mutual').length;
  const notFollowingBack = users.filter(
    (u) => u.status === 'not_following_back',
  ).length;
  const youDontFollowBack = users.filter(
    (u) => u.status === 'you_dont_follow_back',
  ).length;

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        padding: '8px 14px',
        borderBottom: '1px solid #262626',
        fontSize: 11,
      }}
    >
      <Pill label="Mutual" count={mutual} color="#00c853" />
      <Pill label="Not fol. back" count={notFollowingBack} color="#ff1744" />
      <Pill label="Don't fol. back" count={youDontFollowBack} color="#ff9100" />
    </div>
  );
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        borderRight: '1px solid #262626',
        padding: '2px 4px',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15, color }}>{count}</span>
      <span style={{ color: '#888', marginLeft: 4, fontSize: 10 }}>{label}</span>
    </div>
  );
}
