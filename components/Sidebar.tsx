import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { InstagramUser, UserWithStatus, ActionType, FilterType } from '../utils/types';
import { analyzeFollowBack, checkDataCompleteness } from '../utils/analyzer';
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
  const [completenessWarning, setCompletenessWarning] = useState<string | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<string | null>(null);
  const [expectedCounts, setExpectedCounts] = useState<{ followers: number; following: number } | null>(null);
  const [suspicionReports, setSuspicionReports] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');

  const [debugMode, setDebugMode] = useState(false);
  const debugLogBuffer = useRef<string[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!debugMode) return;
    const id = setInterval(() => {
      setDebugLogs(prev => {
        const buf = debugLogBuffer.current;
        if (buf.length === 0) return prev;
        const combined = [...prev, ...buf];
        debugLogBuffer.current = [];
        return combined.slice(-100);
      });
    }, 250);
    return () => clearInterval(id);
  }, [debugMode]);

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
    setCompletenessWarning(null);
    setScrapeSummary(null);
    setDebugLogs([]);
    setSuspicionReports([]);
    debugLogBuffer.current = [];

    const origDebug = console.debug;
    console.debug = (...args: any[]) => {
      const msg = args.map(a => {
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      debugLogBuffer.current.push(msg);
      origDebug.apply(console, args);
    };

    try {
      const { scrapeFollowers, scrapeFollowing, getProfileCounts, findSuspiciousUsers } = await import('../utils/scraper');

      const expected = getProfileCounts();
      setExpectedCounts(expected);
      log(`Expected from page: ${expected.followers} followers, ${expected.following} following`);

      setScrapePhase('Scraping followers...');
      log('Opening followers dialog...');
      const f = await scrapeFollowers();
      setFollowers(f);
      setScrapePhase(`Found ${f.length} followers. Scraping following...`);
      log(`Found ${f.length} followers`);

      const fSuspicion = findSuspiciousUsers(f, expected.followers);
      if (fSuspicion.summary) {
        setSuspicionReports(prev => [...prev, `Followers: ${fSuspicion.summary}`]);
        log(`Followers check: ${fSuspicion.summary}`);
      }

      log('Opening following dialog...');
      const g = await scrapeFollowing();
      setFollowing(g);
      log(`Found ${g.length} following`);

      const gSuspicion = findSuspiciousUsers(g, expected.following);
      if (gSuspicion.summary) {
        setSuspicionReports(prev => [...prev, `Following: ${gSuspicion.summary}`]);
        log(`Following check: ${gSuspicion.summary}`);
      }

      const analyzed = analyzeFollowBack(f, g);
      setUsers(analyzed);
      log(`Analysis complete: ${analyzed.length} total users`);

      const mutuals = analyzed.filter((u) => u.status === 'mutual').length;
      setScrapeSummary(`${f.length} followers, ${g.length} following, ${mutuals} mutuals found`);

      const warning = checkDataCompleteness(f, g);
      if (warning) {
        setCompletenessWarning(warning);
        log(`Data warning: ${warning}`);
      }

      const { saveFollowers, saveFollowing } = await import('../utils/storage');
      await saveFollowers(f);
      await saveFollowing(g);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      log(`Error: ${msg}`);
    } finally {
      console.debug = origDebug;
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
          {scrapeSummary && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: '#888', borderBottom: '1px solid #262626' }}>
              {scrapeSummary}
            </div>
          )}
          {suspicionReports.length > 0 && (
            <div style={{ padding: '6px 14px', fontSize: 10, color: '#e6a817', background: '#1a1505', borderBottom: '1px solid #262626' }}>
              {suspicionReports.map((r, i) => <div key={i}>{r}</div>)}
            </div>
          )}
          {completenessWarning && <WarningBanner message={completenessWarning} />}
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

      <ActionBar
        onScrape={runScrape}
        onCancel={handleCancel}
        scraping={scraping}
        log={actionLog}
        debugMode={debugMode}
        debugLogs={debugLogs}
        onToggleDebug={() => setDebugMode(d => !d)}
        hasData={users.length > 0}
      />
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
        overflow: 'hidden',
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

function ScrapingState({ phase }: { phase: string }) {
  const note = phase.startsWith('Scraping followers')
    ? 'Scrolling through followers list...'
    : 'Scrolling through following list...';
  return (
    <div
      style={{
        padding: 20,
        textAlign: 'center',
        color: '#888',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        style={{ margin: '0 auto 12px', display: 'block' }}
      >
        <circle
          cx="12" cy="12" r="10"
          fill="none" stroke="#333" strokeWidth="3"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          fill="none" stroke="#0095f6"
          strokeWidth="3" strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
      <div style={{ fontSize: 13 }}>{phase}</div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
        {note}
      </div>
    </div>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '8px 14px',
        background: '#3d3a00',
        color: '#ffd54f',
        fontSize: 11,
        borderBottom: '1px solid #665a00',
        lineHeight: 1.4,
      }}
    >
      {message}
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
  debugMode,
  debugLogs,
  onToggleDebug,
  hasData,
}: {
  onScrape: () => void;
  onCancel: () => void;
  scraping: boolean;
  log: string[];
  debugMode: boolean;
  debugLogs: string[];
  onToggleDebug: () => void;
  hasData: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        borderTop: '1px solid #262626',
        padding: '8px 14px',
        flexShrink: 0,
      }}
    >
      {debugMode && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            maxHeight: '40vh',
            overflowY: 'auto',
            zIndex: 999,
            fontSize: 10,
            fontFamily: 'monospace',
            color: '#8bc34a',
            background: '#1a1a1a',
            border: '1px solid #333',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            padding: 6,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {debugLogs.length === 0 ? (
            <div style={{ color: '#666', fontStyle: 'italic' }}>Waiting for logs... scrape to see output</div>
          ) : (
            debugLogs.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))
          )}
        </div>
      )}
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
          {scraping ? 'Scraping...' : hasData ? 'Rescrape' : 'Scrape'}
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
        <button
          onClick={onToggleDebug}
          style={{
            background: debugMode ? '#1a6b3c' : '#333',
            border: 'none',
            color: '#e0e0e0',
            padding: '8px 10px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="Toggle debug log panel"
        >
          Debug
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
