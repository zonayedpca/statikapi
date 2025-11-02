import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { getManifest, getRoute } from './api.js';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

import JsonTree from './components/JsonTree.jsx';
import Snippets from './components/Snippets.jsx';
import CopyButton from './components/CopyButton.jsx';
import Sidebar from './components/Sidebar.jsx';
import AppShell from './components/AppShell.jsx';

export default function App() {
  const [manifest, setManifest] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [rawText, setRawText] = useState('Select a route…');
  const [jsonVal, setJsonVal] = useState(null);
  const [headers, setHeaders] = useState({});
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0); // highlight index in filtered list
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const [tab, setTab] = useState('tree'); // 'tree' | 'pretty' | 'raw'

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

  function fetchAndShow(route) {
    if (!route) return;
    setLoading(true);
    getRoute(route)
      .then(({ text, headers }) => {
        setRawText(text);
        setHeaders(headers || {});
        try {
          setJsonVal(JSON.parse(text));
        } catch {
          setJsonVal(null);
        }
      })
      .catch((e) => {
        setRawText(String(e));
        setJsonVal(null);
        setHeaders({});
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!active) return;
    fetchAndShow(active);
  }, [active]);

  // Live reload via SSE
  useEffect(() => {
    const es = new EventSource('/_ui/events');
    es.onmessage = async (ev) => {
      const msg = String(ev.data || '');
      if (msg.startsWith('changed:')) {
        const route = msg.slice('changed:'.length);
        try {
          const list = await getManifest();
          setManifest(list);
        } catch {}
        if (route && route === active) {
          fetchAndShow(active);
        }
      }
    };
    es.onerror = () => {
      // browser will retry automatically; no-op
    };
    return () => es.close();
    // Include `active` so when it changes we rebind handler that compares current route
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
    setTab('tree');
    location.hash = encodeURIComponent(route);
  };

  // keyboard: up/down to change highlight, Enter to pick
  useEffect(() => {
    const onKey = (e) => {
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

  const prettyText = useMemo(() => {
    if (jsonVal == null) return rawText ?? '';
    try {
      return JSON.stringify(jsonVal, null, 2);
    } catch {
      return rawText ?? '';
    }
  }, [jsonVal, rawText]);

  const sidebar = (
    <Sidebar
      count={manifest.length}
      query={query}
      setQuery={setQuery}
      routes={filtered}
      onPick={pick}
      activeRoute={active}
      highlightedIndex={hi}
      ref={listRef}
      headerExtras={null} // placeholder if you add extra filters later
    />
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="app flex h-screen">
        <section className="flex-1 p-3 overflow-auto">
          {!active ? (
            <div className="text-sm opacity-70">Select a route from the left to view its JSON.</div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Viewing:</span>
                <code className="font-mono">{active}</code>
                {loading && (
                  <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    loading…
                  </span>
                )}
              </div>
              {/* Headers row */}
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                <Badge variant="secondary" title="Content-Type">
                  {headers['content-type'] || '—'}
                </Badge>
                <Badge variant="secondary" title="ETag">
                  {headers.etag || '—'}
                </Badge>
                <Badge variant="secondary" title="Cache-Control">
                  {headers['cache-control'] || '—'}
                </Badge>

                <Separator className="mx-2 hidden sm:inline-flex" orientation="vertical" />

                <div className="ml-auto">
                  <CopyButton getText={() => prettyText} label="Copy JSON" title="Copy JSON" />
                </div>
              </div>

              <Tabs
                value={tab}
                onValueChange={setTab}
                className="w-full bg-accent/50 p-4 rounded-md"
              >
                <TabsList className="">
                  <TabsTrigger value="tree">Tree</TabsTrigger>
                  <TabsTrigger value="pretty">Pretty</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                </TabsList>

                <TabsContent value="tree">
                  <Card className="p-3 overflow-auto">
                    {jsonVal != null ? (
                      <JsonTree data={jsonVal} />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Not valid JSON — showing Raw/Pretty instead.
                      </div>
                    )}
                  </Card>
                </TabsContent>

                <TabsContent value="pretty">
                  <Card className="p-3 overflow-auto">
                    <pre className="whitespace-pre text-sm">{prettyText}</pre>
                  </Card>
                </TabsContent>

                <TabsContent value="raw">
                  <Card className="p-3 overflow-auto">
                    <pre className="whitespace-pre text-sm">{rawText}</pre>
                  </Card>
                </TabsContent>
              </Tabs>
              {/* Snippets */}
              <Snippets route={active} />
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
