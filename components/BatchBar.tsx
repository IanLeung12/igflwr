import React, { useState } from 'react';
import type { UserWithStatus, ActionType } from '../utils/types';

interface BatchBarProps {
  filteredUsers: UserWithStatus[];
  onBatch: (type: ActionType, usernames: string[]) => void;
}

export function BatchBar({ filteredUsers, onBatch }: BatchBarProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map((u) => u.username)));
    }
  };

  const handleBatch = (type: ActionType) => {
    const usernames = Array.from(selected);
    if (usernames.length === 0) return;
    onBatch(type, usernames);
    setSelected(new Set());
  };

  if (filteredUsers.length === 0) return null;

  return (
    <div
      style={{
        padding: '8px 14px',
        borderBottom: '1px solid #262626',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <button
        onClick={toggleAll}
        style={{
          background: '#333',
          border: 'none',
          color: '#e0e0e0',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {selected.size === filteredUsers.length ? 'Deselect all' : `Select all (${filteredUsers.length})`}
      </button>
      <span style={{ fontSize: 11, color: '#888' }}>
        {selected.size} selected
      </span>
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <BatchBtn
            label="Follow"
            color="#0095f6"
            onClick={() => handleBatch('follow')}
          />
          <BatchBtn
            label="Unfollow"
            color="#ff1744"
            onClick={() => handleBatch('unfollow')}
          />
          <BatchBtn
            label="Remove"
            color="#ff9100"
            onClick={() => handleBatch('remove_follower')}
          />
        </div>
      )}
    </div>
  );
}

function BatchBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color,
        border: 'none',
        color: '#fff',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
