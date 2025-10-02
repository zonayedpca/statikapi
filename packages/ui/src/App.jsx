import React, { useEffect, useMemo, useState } from 'react';
import { getManifest, getRouteText } from './api.js';

export default function App() {
  const [manifest, setManifest] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [content, setContent] = useState('Select a route…');
  const [loading, setLoading] = useState(false);

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

  const pick = (route) => {
    setActive(route);
    location.hash = encodeURIComponent(route);
  };

  return (
    <div className="app grid grid-cols-[20rem_1fr] h-screen">
      <aside className="border-r p-3 overflow-auto">
        <header className="flex items-center justify-between mb-2">
          <h1 className="font-semibold">StaticAPI</h1>
          <div className="text-xs opacity-70">{manifest.length} routes</div>
        </header>

        <input
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Filter routes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <nav className="space-y-1">
          {filtered.map((e) => (
            <button
              key={e.route}
              onClick={() => pick(e.route)}
              className={
                'w-full text-left px-3 py-2 rounded hover:bg-black/10 ' +
                (active === e.route ? 'bg-black/10' : '')
              }
              title={`${e.bytes} bytes • ${(e.hash || '').slice(0, 7)}`}
            >
              {e.route}
            </button>
          ))}
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
