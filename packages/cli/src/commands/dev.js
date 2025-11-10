import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config/loadConfig.js';
import { loadModuleValue } from '../loader/loadModuleValue.js';
import { loadPaths } from '../loader/loadPaths.js';
import { mapRoutes, fileToRoute } from '../router/mapRoutes.js';
import { readFlags } from '../util/readFlags.js';
import { writeFileEnsured } from '../util/fsx.js';
import { routeToOutPath } from '../build/routeOutPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hasIndex(dir) {
  return fss.existsSync(path.join(dir, 'index.html'));
}

function clearScreen() {
  process.stdout.write('\x1Bc'); // ANSI "clear screen"
}

function toConcrete(routePattern, segTokens, segs) {
  let idx = 0;

  const parts = routePattern.split('/').map((p) => {
    if (p.startsWith(':')) return segs[idx++] ?? '';
    if (p.startsWith('*')) return segs.slice(idx).join('/');
    return p;
  });

  return parts.join('/').replace(/\/+/g, '/');
}

function toParams(segTokens, concreteRoute) {
  const concreteSegs = concreteRoute.split('/').filter(Boolean);
  const params = {};

  for (let i = 0; i < segTokens.length; i++) {
    const tok = segTokens[i];

    if (tok.startsWith(':')) params[tok.slice(1)] = concreteSegs[i] ?? '';
    else if (tok.startsWith('*')) {
      params[tok.slice(1)] = concreteSegs.slice(i);

      break;
    }
  }

  return params;
}

export default async function devCmd(argv) {
  const flags = readFlags(argv);

  // Allow forcing long-running behavior even in non-TTY (e.g., under `concurrently`)
  const forceKeepAlive =
    !!(flags['keep-alive'] || flags.keepAlive || flags.serve) ||
    process.env.STATIKAPI_FORCE_DEV === '1';

  // In non-TTY (like node --test), behave like a stub unless explicitly forced.
  if (!process.stdout.isTTY && !forceKeepAlive) {
    console.log('statikapi dev → starting dev server (stub)');

    return 0;
  }

  const { config } = await loadConfig({ flags });

  // Where to notify preview
  const host = String(flags.host ?? '127.0.0.1');
  const port = Number.isFinite(flags.port) ? Number(flags.port) : 8788;
  const noUi = !!(flags['no-ui'] || flags.noUi);
  const noOpen = !!(flags['no-open'] || flags.noOpen);

  const sseClients = new Set(); // each entry: { id, res }
  function sseBroadcast(msg) {
    const line = `data: ${msg}\n\n`;
    for (const c of sseClients) {
      try {
        c.res.write(line);
      } catch {
        /* ignore */
      }
    }
  }
  async function notifyChanged(route) {
    // Push to connected UIs
    sseBroadcast(`changed:${route}`);
  }

  // Cache of outputs per source file (for deletions on subsequent rebuilds)
  const lastEmitted = new Map(); // fileAbs -> Set<concreteRoute>

  // Manifest state
  const manifestByRoute = new Map(); // route -> entry

  const digest = (s) => crypto.createHash('sha1').update(s).digest('hex');
  const relSrc = (abs) => {
    try {
      return path.relative(process.cwd(), abs) || abs;
    } catch {
      return abs;
    }
  };
  const relOut = (abs) => {
    try {
      return path.relative(process.cwd(), abs).replaceAll(path.sep, '/') || abs;
    } catch {
      return abs;
    }
  };
  async function writeManifest() {
    const list = Array.from(manifestByRoute.values()).sort((a, b) =>
      a.route.localeCompare(b.route)
    );
    const json = JSON.stringify(list, null, 2) + '\n';
    await writeFileEnsured(path.join(config.paths.outAbs, '.statikapi', 'manifest.json'), json);
  }
  async function upsertManifest({ route, srcFile, outFile, json }) {
    const st = await fs.stat(outFile).catch(() => null);

    const entry = {
      route,
      outFile: relOut(outFile),
      srcFile: relSrc(srcFile),
      filePath: relOut(outFile), // backward-compat alias
      bytes: Buffer.byteLength(json),
      mtime: st ? st.mtimeMs : Date.now(),
      hash: digest(json),
    };

    manifestByRoute.set(route, entry);
  }
  function deleteFromManifest(route) {
    manifestByRoute.delete(route);
  }

  async function emitStatic(r, { fresh = false } = {}) {
    const val = await loadModuleValue(r.file, { __fresh: fresh });
    const json = JSON.stringify(val, null, 2) + '\n';
    const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: r.route });
    await writeFileEnsured(outFile, json);
    lastEmitted.set(r.file, new Set([r.route]));
    await upsertManifest({ route: r.route, srcFile: r.file, outFile, json });
    // notify UI
    await notifyChanged(r.route);
    return 1;
  }

  async function emitDynamic(r, { fresh = false } = {}) {
    const list = await loadPaths(r.file, r, { fresh });
    if (!list) {
      lastEmitted.set(r.file, new Set());
      return { written: 0, skipped: 1 };
    }
    const seen = new Set();
    const emittedRoutes = new Set();
    let written = 0;
    for (const segs of list) {
      const concrete = toConcrete(r.route, r.segments, segs);
      if (seen.has(concrete)) continue;
      seen.add(concrete);
      const params = toParams(r.segments, concrete);
      const val = await loadModuleValue(r.file, { params, __fresh: fresh });
      const json = JSON.stringify(val, null, 2) + '\n';
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: concrete });
      await writeFileEnsured(outFile, json);
      emittedRoutes.add(concrete);
      await upsertManifest({ route: concrete, srcFile: r.file, outFile, json });
      written++;
    }

    // Delete stale outputs from this file (not present anymore)
    const prev = lastEmitted.get(r.file) || new Set();
    for (const oldRoute of prev) {
      if (!emittedRoutes.has(oldRoute)) {
        const p = routeToOutPath({ outAbs: config.paths.outAbs, route: oldRoute });
        try {
          await fs.rm(p, { force: true });
        } catch {
          // ignore
        }
        deleteFromManifest(oldRoute);
        await notifyChanged(oldRoute);
      }
    }
    lastEmitted.set(r.file, emittedRoutes);

    // notify UI for all emitted routes
    for (const route of emittedRoutes) {
      await notifyChanged(route);
    }

    return { written, skipped: 0 };
  }

  function shouldHandle(fileAbs) {
    const rel = path.posix.normalize(
      fileAbs.replaceAll(path.sep, '/').slice(config.paths.srcAbs.length + 1)
    );
    if (!rel) return false;
    if (rel.startsWith('_')) return false;
    const ext = path.extname(rel);

    return ['.js', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext);
  }

  async function buildOne(fileAbs, kind) {
    if (!shouldHandle(fileAbs)) return;

    const info = fileToRoute({ srcAbs: config.paths.srcAbs, fileAbs });
    clearScreen();
    console.log(`statikapi dev → ${kind}: ${path.relative(process.cwd(), fileAbs)}`);

    if (!info) {
      // File is ignored or no longer maps; delete prior outputs if any
      const prev = lastEmitted.get(fileAbs);

      if (prev) {
        for (const route of prev) {
          const p = routeToOutPath({ outAbs: config.paths.outAbs, route });
          try {
            await fs.rm(p, { force: true });
          } catch {
            // ignore
          }
          deleteFromManifest(route);
          await notifyChanged(route);
        }
        lastEmitted.delete(fileAbs);
      }

      console.log(`[statikapi] (ignored or unmapped)`);
      await writeManifest();

      return;
    }

    const r = { file: fileAbs, route: info.route, type: info.type, segments: info.normSegments };

    try {
      if (r.type === 'static') {
        const files = await emitStatic(r, { fresh: true });
        console.log(`[statikapi] wrote ${files} file(s) for ${r.route}`);
      } else {
        const { written, skipped } = await emitDynamic(r, { fresh: true });
        const extra = skipped ? `, skipped ${skipped}` : '';
        console.log(`[statikapi] wrote ${written} file(s) for ${r.route}${extra}`);
      }
      await writeManifest();
    } catch (err) {
      console.error(`[statikapi] ${err?.message || err}`);
    }
  }

  // Initial full build
  clearScreen();
  console.log('statikapi dev → initial build…');

  const routes = await mapRoutes({ srcAbs: config.paths.srcAbs });

  for (const r of routes) {
    if (r.type === 'static') await emitStatic(r);
    else await emitDynamic(r);
  }

  await writeManifest();
  console.log(`[statikapi] ready. Watching ${path.relative(process.cwd(), config.paths.srcAbs)}/`);

  const server = http.createServer(async (req, res) => {
    try {
      let url;
      try {
        url = new URL(req.url || '/', `http://${host}:${port}`);
      } catch {
        // Extremely defensive fallback
        url = new URL('/', `http://${host}:${port}`);
      }
      const pathname = url.pathname;

      if (pathname === '/_ui/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no', // for proxies
        });
        res.write('\n');
        const client = { id: Date.now() + Math.random(), res };
        sseClients.add(client);
        req.on('close', () => sseClients.delete(client));
        return;
      }

      if (pathname === '/ui/index' && req.method === 'GET') {
        const list = Array.from(manifestByRoute.values()).sort((a, b) =>
          a.route.localeCompare(b.route)
        );
        const body = JSON.stringify(list);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(body);
        return;
      }

      if (pathname === '/_ui/file' && req.method === 'GET') {
        const route = url.searchParams.get('route') || '';
        const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route });
        // best-effort headers
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const rs = fss.createReadStream(outFile);
          rs.on('error', () => {
            res.statusCode = 404;
            res.end(`Not found: ${route}`);
          });
          rs.pipe(res);
        } catch {
          res.statusCode = 404;
          res.end(`Not found: ${route}`);
        }
        return;
      }

      if (!noUi && pathname.startsWith('/_ui/')) {
        const uiRoot = resolveUiDist();
        const rel = pathname.replace(/^\/_ui\//, '') || 'index.html';
        const file = path.join(uiRoot, rel);
        if (!file.startsWith(uiRoot)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        try {
          const stat = await fs.stat(file);
          if (stat.isDirectory()) {
            // try index.html inside subdir
            const idx = path.join(file, 'index.html');
            await fs.access(idx);
            streamFile(idx, res);
          } else {
            streamFile(file, res);
          }
        } catch {
          // Fallback to index.html for SPA routes
          const fallback = path.join(uiRoot, 'index.html');
          streamFile(fallback, res);
        }
        return;
      }

      if (!noUi && pathname === '/') {
        res.writeHead(302, { Location: '/_ui/' });
        res.end();
        return;
      }

      // Serve built JSON directly from api-out
      {
        const outRoot = config.paths.outAbs;
        // strip leading slash and normalize
        const rel = pathname.replace(/^\/+/, '');
        const candidates = [];

        // If the request ends with .json, try that file directly
        if (rel.endsWith('.json')) {
          candidates.push(path.join(outRoot, rel));
        } else {
          // Otherwise, try a folder with index.json (e.g. "/" or "/users/1/")
          candidates.push(path.join(outRoot, rel, 'index.json'));
        }

        for (const cand of candidates) {
          const file = path.resolve(cand);
          // prevent path traversal
          if (!file.startsWith(path.resolve(outRoot))) continue;

          try {
            const st = await fs.stat(file);
            if (st.isFile()) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              fss.createReadStream(file).pipe(res);
              return; // served
            }
          } catch {
            // try next candidate
          }
        }
      }

      // Otherwise: 404
      res.statusCode = 404;
      res.end('Not Found');
    } catch (e) {
      console.log(e);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(port, host, () => {
    console.log(`statikapi dev → serving on http://${host}:${port}${noUi ? '' : '/_ui/'}`);
    if (!noUi && !noOpen) {
      openInBrowser(`http://${host}:${port}/_ui/`).catch(() => {});
    }
  });

  const watcher = chokidar.watch(config.paths.srcAbs, {
    ignoreInitial: true,
    ignored: (p) => path.basename(p).startsWith('_'),
  });

  watcher.on('add', (p) => buildOne(p, 'add'));
  watcher.on('change', (p) => buildOne(p, 'change'));
  watcher.on('unlink', (p) => buildOne(p, 'unlink'));

  // Keep process alive until SIGINT
  await new Promise((resolve) => {
    const stop = () =>
      Promise.allSettled([watcher.close(), new Promise((r) => server.close(() => r()))]).then(() =>
        resolve()
      );
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

  return 0;
}

function streamFile(file, res) {
  const ext = path.extname(file).toLowerCase();
  const ctype =
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.js'
        ? 'text/javascript; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.json'
            ? 'application/json; charset=utf-8'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.map'
                ? 'application/json; charset=utf-8'
                : 'application/octet-stream';
  res.setHeader('Content-Type', ctype);
  fss.createReadStream(file).pipe(res);
}

function resolveUiDist() {
  // Optional override for power users
  const fromEnv = process.env.STATIKAPI_UI_DIR;
  if (fromEnv && hasIndex(fromEnv)) return fromEnv;

  // Bundled with the CLI: packages/cli/ui/
  const bundled = path.resolve(__dirname, '..', '..', 'ui');
  if (hasIndex(bundled)) return bundled;

  // Monorepo dev fallback: packages/ui/dist
  const monorepoDist = path.resolve(__dirname, '..', '..', '..', 'ui', 'dist');
  if (hasIndex(monorepoDist)) return monorepoDist;

  // Last resort: throw with a helpful hint
  throw new Error(
    'StatikAPI UI build not found. ' +
      'Either keep a built UI at packages/cli/ui/ (index.html present), ' +
      'or run: pnpm -w --filter @statikapi/ui build'
  );
}

async function openInBrowser(url) {
  const { exec } = await import('node:child_process');
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}
