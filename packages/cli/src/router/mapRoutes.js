import fs from 'node:fs/promises';
import path from 'node:path';

const VALID_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

export async function mapRoutes({ srcAbs }) {
  const entries = await walk(srcAbs);
  const routes = [];

  for (const fileAbs of entries) {
    const info = fileToRoute({ srcAbs, fileAbs });
    if (!info) continue;
    const { route, type, normSegments } = info;

    routes.push({
      file: fileAbs,
      route,
      type, // 'static' | 'dynamic' | 'catchall'
      segments: normSegments, // normalized tokens for sorting (static or :param or *catch)
    });
  }

  // Deterministic sort
  routes.sort(compareRoutes);

  return routes;
}

async function walk(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const cur = stack.pop();
    const items = await fs.readdir(cur, { withFileTypes: true });

    for (const it of items) {
      const a = path.join(cur, it.name);

      if (it.isDirectory()) {
        stack.push(a);
      } else if (it.isFile()) {
        out.push(a);
      }
    }
  }

  return out;
}

/** Map a single file to route metadata, or null if ignored. */
export function fileToRoute({ srcAbs, fileAbs }) {
  const rel = path.posix.normalize(fileAbs.replaceAll(path.sep, '/').slice(srcAbs.length + 1));
  if (!rel || rel.startsWith('_')) return null; // ignore underscore roots
  const ext = path.extname(rel);
  if (!VALID_EXT.has(ext)) return null;

  const relNoExt = rel.slice(0, -ext.length);
  const segments = relNoExt
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.some((s) => s.startsWith('_'))) return null;

  const { route, type, normSegments } = toRoute(segments);

  return { route, type, normSegments };
}

function toRoute(segments) {
  // Handle index collapsing: foo/index -> /foo
  const last = segments[segments.length - 1];
  const isIndex = last === 'index';
  const segs = isIndex ? segments.slice(0, -1) : segments;

  // Normalize tokens:
  //  - static: 'users' stays 'users'
  //  - dynamic: '[id]' => ':id'
  //  - catch-all: '[...all]' => '*all'
  let type = 'static';
  const normSegments = segs.map((s) => {
    if (isCatchAll(s)) {
      type = 'catchall';
      return '*' + s.slice(4, -1); // [...all] -> *all
    }
    if (isDynamic(s)) {
      if (type !== 'catchall') type = 'dynamic';
      return ':' + s.slice(1, -1); // [id] -> :id
    }
    return s;
  });

  const route = '/' + normSegments.filter(Boolean).join('/');

  // special case: empty means root (/)
  const finalRoute = route === '/' ? '/' : route;

  return { route: finalRoute, type, normSegments };
}

function isDynamic(seg) {
  return seg.startsWith('[') && seg.endsWith(']') && !seg.startsWith('[...');
}

function isCatchAll(seg) {
  return seg.startsWith('[...') && seg.endsWith(']');
}

// Deterministic sort:
// 1) static < dynamic < catchall
// 2) lexicographic by route (so /blog/archive comes before /users)
// 3) fewer segments as a final tiebreaker
function compareRoutes(a, b) {
  const rank = { static: 0, dynamic: 1, catchall: 2 };

  if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type];

  const byRoute = a.route.localeCompare(b.route);

  if (byRoute !== 0) return byRoute;

  return a.segments.length - b.segments.length;
}
