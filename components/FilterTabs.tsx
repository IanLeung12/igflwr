import React from 'react';
import type { FilterType } from '../utils/types';

interface FilterTabsProps {
  active: FilterType;
  counts: Record<string, number>;
  onChange: (filter: FilterType) => void;
}

const TABS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mutual', label: 'Mutual' },
  { key: 'not_following_back', label: 'Not following back' },
  { key: 'you_dont_follow_back', label: "You don't follow back" },
];

export function FilterTabs({ active, counts, onChange }: FilterTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #262626',
        overflowX: 'auto',
      }}
    >
      {TABS.map((tab) => {
        const count = tab.key === 'all'
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : counts[tab.key] || 0;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 6px',
              background: 'transparent',
              border: 'none',
              borderBottom: active === tab.key ? '2px solid #0095f6' : '2px solid transparent',
              color: active === tab.key ? '#e0e0e0' : '#666',
              fontSize: 11,
              fontWeight: active === tab.key ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
            <span style={{ marginLeft: 4, color: '#888' }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
