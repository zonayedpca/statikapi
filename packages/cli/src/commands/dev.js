import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { readFlags } from '../util/readFlags.js';
import { loadConfig } from '../config/loadConfig.js';
import { mapRoutes, fileToRoute } from '../router/mapRoutes.js';
import { routeToOutPath } from '../build/routeOutPath.js';
import { writeFileEnsured } from '../util/fsx.js';
import { loadModuleValue } from '../loader/loadModuleValue.js';
import { loadPaths } from '../loader/loadPaths.js';

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
  // In non-TTY (like node --test), behave like the old stub so tests don't hang.
  if (!process.stdout.isTTY) {
    console.log('statikapi dev → starting dev server (stub)');
    return 0;
  }

  const flags = readFlags(argv);
  const { config } = await loadConfig({ flags });

  // Where to notify preview
  const previewHost = String(flags.previewHost ?? '127.0.0.1');
  const previewPort = Number.isFinite(flags.previewPort) ? Number(flags.previewPort) : 8788;
  const notifyOrigin = `http://${previewHost}:${previewPort}`;

  async function notifyChanged(route) {
    try {
      // Node 18+ has global fetch
      const u = `${notifyOrigin}/_ui/changed?route=${encodeURIComponent(route)}`;
      await fetch(u, { method: 'POST' }).catch(() => {});
    } catch {
      // Ignore if preview isn't running
    }
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
      revalidate: null,
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
    return ext === '.js' || ext === '.mjs' || ext === '.cjs';
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

  const watcher = chokidar.watch(config.paths.srcAbs, {
    ignoreInitial: true,
    ignored: (p) => path.basename(p).startsWith('_'),
  });
  watcher.on('add', (p) => buildOne(p, 'add'));
  watcher.on('change', (p) => buildOne(p, 'change'));
  watcher.on('unlink', (p) => buildOne(p, 'unlink'));

  // Keep process alive until SIGINT
  await new Promise((resolve) => {
    const stop = () => watcher.close().then(resolve).catch(resolve);
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
  return 0;
}
