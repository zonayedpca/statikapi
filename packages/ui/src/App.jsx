import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getManifest, getRouteText } from './api.js';

export default function App() {
  const [manifest, setManifest] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [content, setContent] = useState('Select a route…');
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0); // highlight index in filtered list
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getManifest().then(setManifest).catch(console.error);
  }, []);

  useEffect(() => {
    const init = decodeURIComponent(location.hash.slice(1));
    if (init) setActive(init);
    const onHash = () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (h) setActive(h);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    getRouteText(active)
      .then((txt) => {
        try {
          setContent(JSON.stringify(JSON.parse(txt), null, 2));
        } catch {
          setContent(txt);
        }
      })
      .catch((e) => setContent(String(e)))
      .finally(() => setLoading(false));
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return manifest.filter((m) => (m.route || '').toLowerCase().includes(q));
  }, [manifest, query]);

  // keep highlight index within bounds whenever filter changes
  useEffect(() => {
    setHi((i) => {
      if (!filtered.length) return 0;
      return Math.min(Math.max(i, 0), filtered.length - 1);
    });
  }, [filtered]);

  const pick = (route) => {
    setActive(route);
    location.hash = encodeURIComponent(route);
  };

  // keyboard: up/down to change highlight, Enter to pick
  useEffect(() => {
    const onKey = (e) => {
      // Only react when focus is on the search input or inside the list
      const inScope =
        document.activeElement === inputRef.current ||
        (listRef.current && listRef.current.contains(document.activeElement));
      if (!inScope) return;
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHi((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHi((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = filtered[hi]?.route;
        if (r) pick(r);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [filtered, hi]);

  function formatBytes(n) {
    if (!Number.isFinite(n)) return '—';
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let u = -1;
    let v = n;
    do {
      v /= 1024;
      u++;
    } while (v >= 1024 && u < units.length - 1);
    const f = v >= 10 ? 0 : 1;
    return `${v.toFixed(f)} ${units[u]}`;
  }

  function formatDate(ms) {
    const d = new Date(ms);
    if (isNaN(d)) return '—';
    // Short & local
    return d.toLocaleString();
  }

  function Badge({ children, title }) {
    return (
      <span
        className="inline-block text-[11px] px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 mr-2"
        title={title}
      >
        {children}
      </span>
    );
  }

  return (
    <div className="app grid grid-cols-[20rem_1fr] h-screen">
      <aside className="border-r p-3 overflow-auto">
        <header className="flex items-center justify-between mb-2">
          <h1 className="font-semibold">StaticAPI</h1>
          <div className="text-xs opacity-70">{manifest.length} routes</div>
        </header>

        <input
          ref={inputRef}
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Filter routes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <nav
          ref={listRef}
          className="space-y-1"
          role="listbox"
          aria-label="Endpoints"
          aria-activedescendant={
            filtered[hi]?.route ? `route-${cssId(filtered[hi].route)}` : undefined
          }
        >
          {filtered.map((e, idx) => {
            const isActive = active === e.route;
            const isHilited = idx === hi;
            return (
              <button
                key={e.route}
                id={`route-${cssId(e.route)}`}
                role="option"
                aria-selected={isHilited}
                onClick={() => pick(e.route)}
                className={[
                  'w-full text-left px-3 py-2 rounded outline-none',
                  'hover:bg-black/10 focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20',
                  isHilited ? 'bg-black/10 dark:bg-white/10' : '',
                  isActive ? 'ring-1 ring-black/20 dark:ring-white/20' : '',
                ].join(' ')}
                title={`bytes: ${e.bytes} • hash: ${(e.hash || '').slice(0, 7)}`}
              >
                <div className="font-mono text-sm">{e.route}</div>
                <div className="mt-1 text-[12px] text-black/70 dark:text-white/70">
                  <Badge title={`${e.bytes} bytes`}>{formatBytes(e.bytes)}</Badge>
                  <Badge title={`Modified: ${formatDate(e.mtime)}`}>{formatDate(e.mtime)}</Badge>
                  <Badge title="Revalidate seconds">
                    revalidate: {e.revalidate == null ? '—' : String(e.revalidate)}
                  </Badge>
                </div>
              </button>
            );
          })}
          {!filtered.length && <div className="text-xs opacity-70">No routes match “{query}”.</div>}
        </nav>
      </aside>

      <section className="p-3 overflow-auto">
        {!active ? (
          <div className="text-sm opacity-70">Select a route from the left to view its JSON.</div>
        ) : (
          <>
            <div className="mb-2 text-sm">
              <span className="opacity-70">Viewing:</span>{' '}
              <span className="font-mono">{active}</span>
              {loading && <span className="opacity-70 ml-2">loading…</span>}
            </div>
            <pre className="whitespace-pre-wrap break-words bg-black/5 p-3 rounded">{content}</pre>
          </>
        )}
      </section>
    </div>
  );
}

function cssId(s) {
  return s.replace(/[^a-zA-Z0-9-_:.]/g, '_');
}
