import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';

function Popup() {
  const [stats, setStats] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    browser.storage.local.get('igflwr_data').then((result) => {
      const data = (result.igflwr_data || {}) as {
        followers?: unknown[];
        following?: unknown[];
      };
      setStats({
        followers: (data.followers || []).length,
        following: (data.following || []).length,
      });
    });
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 12,
          color: '#e0e0e0',
        }}
      >
        IG Flwr
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <MiniStat label="Followers" count={stats.followers} />
        <MiniStat label="Following" count={stats.following} />
      </div>
      <div
        style={{
          background: '#1e1e1e',
          borderRadius: 8,
          padding: 12,
          fontSize: 12,
          color: '#888',
          lineHeight: 1.5,
        }}
      >
        <div>Open Instagram and click the floating</div>
        <div>
          <strong style={{ color: '#0095f6' }}>IG</strong> button to open the
          sidebar.
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <a
          href="https://www.instagram.com"
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#0095f6',
            fontSize: 12,
            textDecoration: 'none',
          }}
        >
          Open Instagram →
        </a>
      </div>
    </div>
  );
}

function MiniStat({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        background: '#1e1e1e',
        borderRadius: 8,
        padding: '10px 12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: '#e0e0e0' }}>
        {count}
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
