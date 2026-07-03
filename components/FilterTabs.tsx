import React from 'react';
import type { FilterType } from '../utils/types';

interface FilterTabsProps {
  active: FilterType;
  counts: Record<string, number>;
  onChange: (filter: FilterType) => void;
}

export function FilterTabs({ active, counts, onChange }: FilterTabsProps) {
  return (
    <div style={{ padding: '6px 14px', borderBottom: '1px solid #262626' }}>
      <select
        value={active}
        onChange={(e) => onChange(e.target.value as FilterType)}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid #333',
          background: '#1e1e1e',
          color: '#e0e0e0',
          fontSize: 12,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="all">
          All ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </option>
        <option value="mutual">Mutual ({counts.mutual || 0})</option>
        <option value="not_following_back">
          Not following back ({counts.not_following_back || 0})
        </option>
        <option value="you_dont_follow_back">
          You don't follow back ({counts.you_dont_follow_back || 0})
        </option>
      </select>
    </div>
  );
}
