import React from 'react';
import type { UserWithStatus, ActionType } from '../utils/types';
import { UserCard } from './UserCard';

interface UserListProps {
  users: UserWithStatus[];
  totalUsers: number;
  onAction: (username: string, action: ActionType) => void;
}

export function UserList({ users, totalUsers, onAction }: UserListProps) {
  if (users.length === 0) {
    return (
      <div
        style={{
          padding: 30,
          textAlign: 'center',
          color: '#666',
          fontSize: 13,
        }}
      >
        {totalUsers === 0
          ? 'No users to display. Click "Scrape" to load data.'
          : 'No users match the current filter.'}
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
      {users.map((user) => (
        <UserCard key={user.username} user={user} onAction={onAction} />
      ))}
    </div>
  );
}
