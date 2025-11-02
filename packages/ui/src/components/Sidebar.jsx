import React, { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const RouteItem = ({ route, active, highlighted, onClick, subtitle }) => (
  <button
    onClick={onClick}
    className={[
      'w-full text-left rounded-md px-3 py-2 outline-none transition',
      active
        ? 'border-2 bg-accent/50'
        : 'border-2 border-transparent hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring',
    ].join(' ')}
  >
    <div className="font-mono text-sm">{route}</div>
    {subtitle && (
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">{subtitle}</div>
    )}
  </button>
);

const Sidebar = forwardRef(function Sidebar(
  { count, query, setQuery, routes, onPick, activeRoute, highlightedIndex, headerExtras },
  listRef
) {
  return (
    <aside className="min-h-0 border-r">
      <div className="sticky top-0 z-10 grid gap-2 border-b bg-background p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Endpoints</div>
          <Badge variant="secondary">{count}</Badge>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter routes…"
          className="h-9"
        />
        {headerExtras}
      </div>

      <ScrollArea className="h-[calc(100vh-12rem)] p-3" ref={listRef}>
        <div className="space-y-1">
          {routes.map((e, idx) => (
            <RouteItem
              key={e.route}
              route={e.route}
              active={activeRoute === e.route}
              highlighted={highlightedIndex === idx}
              onClick={() => onPick(e.route)}
              subtitle={
                <span className="flex gap-2">
                  <span title={`${e.bytes} bytes`}>{formatBytes(e.bytes)}</span>
                  <span title={`Modified: ${formatDate(e.mtime)}`}>{formatDate(e.mtime)}</span>
                  <span>revalidate: {e.revalidate == null ? '—' : String(e.revalidate)}</span>
                </span>
              }
            />
          ))}
          {!routes.length && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No routes match “{query}”.
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
});

export default Sidebar;

function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let i = -1,
    v = n;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < u.length - 1);
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}
function formatDate(ms) {
  const d = new Date(ms);
  if (isNaN(d)) return '—';
  return d.toLocaleString();
}
