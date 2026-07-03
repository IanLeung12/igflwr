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
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '4px',
        padding: '10px 14px',
        borderBottom: '1px solid #262626',
      }}
    >
      <StatBox label="Mutual" count={mutual} color="#00c853" />
      <StatBox
        label="Not following back"
        count={notFollowingBack}
        color="#ff1744"
      />
      <StatBox
        label="You don't follow back"
        count={youDontFollowBack}
        color="#ff9100"
      />
    </div>
  );
}

function StatBox({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{count}</div>
      <div
        style={{
          fontSize: 10,
          color: '#888',
          lineHeight: '1.2',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
