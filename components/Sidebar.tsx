import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { InstagramUser, UserWithStatus, ActionType, FilterType } from '../utils/types';
import { analyzeFollowBack } from '../utils/analyzer';
import { loadStorage } from '../utils/storage';
import { enqueueAction, enqueueBatch, cancelQueue } from '../utils/actions';
import { StatsBar } from './StatsBar';
import { FilterTabs } from './FilterTabs';
import { BatchBar } from './BatchBar';
import { UserList } from './UserList';

interface SidebarProps {
  onClose: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [actionLog, setActionLog] = useState<string[]>([]);

  const [followers, setFollowers] = useState<InstagramUser[]>([]);
  const [following, setFollowing] = useState<InstagramUser[]>([]);
  const [users, setUsers] = useState<UserWithStatus[]>([]);

  const [scraping, setScraping] = useState(false);
  const [scrapePhase, setScrapePhase] = useState('');

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStorage()
      .then((data) => {
        setFollowers(data.followers);
        setFollowing(data.following);
        if (data.followers.length > 0 || data.following.length > 0) {
          const analyzed = analyzeFollowBack(data.followers, data.following);
          setUsers(analyzed);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const log = useCallback((msg: string) => {
    setActionLog((prev) => [msg, ...prev].slice(0, 20));
  }, []);

  const runScrape = useCallback(async () => {
    setScraping(true);
    setError(null);
    setActionLog([]);

    try {
      const { scrapeFollowers, scrapeFollowing } = await import('../utils/scraper');

      setScrapePhase('Scraping followers...');
      log('Opening followers dialog...');
      const f = await scrapeFollowers();
      setFollowers(f);
      log(`Found ${f.length} followers`);

      setScrapePhase('Scraping following...');
      log('Opening following dialog...');
      const g = await scrapeFollowing();
      setFollowing(g);
      log(`Found ${g.length} following`);

      const analyzed = analyzeFollowBack(f, g);
      setUsers(analyzed);
      log(`Analysis complete: ${analyzed.length} total users`);

      const { saveFollowers, saveFollowing } = await import('../utils/storage');
      await saveFollowers(f);
      await saveFollowing(g);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      log(`Error: ${msg}`);
    } finally {
      setScraping(false);
      setScrapePhase('');
    }
  }, [log]);

  const handleAction = useCallback(
    (username: string, type: ActionType) => {
      enqueueAction(type, username);
      log(`${type} queued for @${username}`);
    },
    [log],
  );

  const handleBatch = useCallback(
    async (type: ActionType, usernames: string[]) => {
      await enqueueBatch(type, usernames);
      log(`Batch ${type} queued for ${usernames.length} users`);
    },
    [log],
  );

  const handleCancel = useCallback(() => {
    cancelQueue();
    log('Queue cancelled');
  }, [log]);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (activeFilter !== 'all') {
      result = result.filter((u) => u.status === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.fullName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [users, activeFilter, searchQuery]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      counts[u.status] = (counts[u.status] || 0) + 1;
    }
    return counts;
  }, [users]);

  if (loading) {
    return (
      <Container onClose={onClose}>
        <div style={{ padding: 30, textAlign: 'center', color: '#666' }}>
          Loading...
        </div>
      </Container>
    );
  }

  return (
    <Container onClose={onClose}>
      <Header onClose={onClose} />

      {users.length === 0 && !scraping && (
        <EmptyState onScrape={runScrape} />
      )}

      {scraping && <ScrapingState phase={scrapePhase} />}

      {error && <ErrorBanner message={error} />}

      {users.length > 0 && (
        <>
          <StatsBar users={users} />
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <FilterTabs
            active={activeFilter}
            counts={filterCounts}
            onChange={setActiveFilter}
          />
          <BatchBar filteredUsers={filteredUsers} onBatch={handleBatch} />
          <UserList users={filteredUsers} totalUsers={users.length} onAction={handleAction} />
        </>
      )}

      {users.length > 0 && (
        <ActionBar
          onScrape={runScrape}
          onCancel={handleCancel}
          scraping={scraping}
          log={actionLog}
        />
      )}
    </Container>
  );
}

function Container({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        background: '#121212',
        color: '#e0e0e0',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: 13,
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
        borderLeft: '1px solid #262626',
      }}
    >
      {children}
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid #262626',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15, color: '#e0e0e0' }}>
        IG Flwr
      </span>
      <button
        onClick={onClose}
        style={{
          background: '#333',
          border: 'none',
          color: '#e0e0e0',
          width: 28,
          height: 28,
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function EmptyState({ onScrape }: { onScrape: () => void }) {
  return (
    <div
      style={{
        padding: 40,
        textAlign: 'center',
        color: '#888',
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 16 }}>
        No follower data yet.
      </div>
      <div style={{ fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>
        Make sure you are on an Instagram profile page and click "Scrape" to
        start.
      </div>
      <button
        onClick={onScrape}
        style={{
          background: '#0095f6',
          border: 'none',
          color: '#fff',
          padding: '10px 24px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Scrape Followers & Following
      </button>
    </div>
  );
}

const spinKeyframes = `@keyframes igflwr-spin { to { transform: rotate(360deg); } }`;

function ScrapingState({ phase }: { phase: string }) {
  return (
    <div
      style={{
        padding: 20,
        textAlign: 'center',
        color: '#888',
      }}
    >
      <style>{spinKeyframes}</style>
      <div
        style={{
          width: 24,
          height: 24,
          border: '3px solid #333',
          borderTop: '3px solid #0095f6',
          borderRadius: '50%',
          margin: '0 auto 12px',
          animation: 'igflwr-spin 0.8s linear infinite',
        }}
      />
      <div style={{ fontSize: 13 }}>{phase}</div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
        Scrolling through list...
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        background: '#3d0000',
        color: '#ff5252',
        fontSize: 12,
        borderBottom: '1px solid #620000',
      }}
    >
      <strong>Error:</strong> {message}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid #262626' }}>
      <input
        type="text"
        placeholder="Search by username..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '7px 10px',
          borderRadius: 6,
          border: '1px solid #333',
          background: '#1e1e1e',
          color: '#e0e0e0',
          fontSize: 12,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function ActionBar({
  onScrape,
  onCancel,
  scraping,
  log,
}: {
  onScrape: () => void;
  onCancel: () => void;
  scraping: boolean;
  log: string[];
}) {
  return (
    <div
      style={{
        borderTop: '1px solid #262626',
        padding: '8px 14px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button
          onClick={onScrape}
          disabled={scraping}
          style={{
            flex: 1,
            background: scraping ? '#333' : '#0095f6',
            border: 'none',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: scraping ? 'not-allowed' : 'pointer',
            opacity: scraping ? 0.5 : 1,
          }}
        >
          {scraping ? 'Scraping...' : 'Rescrape'}
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#333',
            border: 'none',
            color: '#e0e0e0',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            cursor: 'pointer',
          }}
          title="Refresh page"
        >
          Refresh
        </button>
      </div>
      {log.length > 0 && (
        <div
          style={{
            maxHeight: 60,
            overflowY: 'auto',
            fontSize: 10,
            color: '#666',
            lineHeight: 1.4,
          }}
        >
          {log.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
