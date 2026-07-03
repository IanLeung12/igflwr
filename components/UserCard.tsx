import React, { useState } from 'react';
import type { UserWithStatus, ActionType } from '../utils/types';

interface UserCardProps {
  user: UserWithStatus;
  onAction: (username: string, action: ActionType) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  mutual: { label: 'Mutual', color: '#00c853' },
  not_following_back: { label: 'Not following back', color: '#ff1744' },
  you_dont_follow_back: { label: "You don't follow back", color: '#ff9100' },
  unknown: { label: 'Unknown', color: '#757575' },
};

export function UserCard({ user, onAction }: UserCardProps) {
  const info = STATUS_LABELS[user.status] || STATUS_LABELS.unknown;
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderBottom: '1px solid #262626',
        transition: 'background 0.15s',
        background: hovered ? '#1e1e1e' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!imgError && (
        <img
          src={user.avatarUrl}
          alt={user.username}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            flexShrink: 0,
            background: '#333',
          }}
          onError={() => setImgError(true)}
        />
      )}
      {imgError && (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            flexShrink: 0,
            background: '#333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: '#666',
          }}
        >
          {user.username[0]?.toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: '#e0e0e0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.username}
        </div>
        {user.fullName && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
            {user.fullName}
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: info.color,
            fontWeight: 500,
            marginTop: 2,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}
        >
          {info.label}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {user.isInFollowing && (
          <button
            onClick={() => onAction(user.username, 'unfollow')}
            style={{
              background: '#333',
              border: 'none',
              color: '#e0e0e0',
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Unfollow"
          >
            Unfollow
          </button>
        )}
        {!user.isInFollowing && (
          <button
            onClick={() => onAction(user.username, 'follow')}
            style={{
              background: '#0095f6',
              border: 'none',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Follow"
          >
            Follow
          </button>
        )}
        {user.isInFollowers && !user.isInFollowing && (
          <button
            onClick={() => onAction(user.username, 'remove_follower')}
            style={{
              background: 'transparent',
              border: '1px solid #555',
              color: '#e0e0e0',
              padding: '5px 10px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Remove follower"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
