import chokidar from 'chokidar';
import path from 'node:path';
import fs from 'node:fs/promises';
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
  const flags = readFlags(argv);
  const { config } = await loadConfig({ flags });

  // Cache of outputs per source file (for deletions on subsequent rebuilds)
  const lastEmitted = new Map(); // fileAbs -> Set<concreteRoute>

  async function emitStatic(r, { fresh = false } = {}) {
    const val = await loadModuleValue(r.file, { __fresh: fresh });
    const json = JSON.stringify(val, null, 2) + '\n';
    const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: r.route });
    await writeFileEnsured(outFile, json);
    lastEmitted.set(r.file, new Set([r.route]));
    return 1;
  }

  async function emitDynamic(r, { fresh = false } = {}) {
    const list = await loadPaths(r.file, r, { fresh });
    if (!list) {
      // no paths() -> nothing to emit
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
      written++;
    }
    // Delete stale outputs from this file (not present anymore)
    const prev = lastEmitted.get(r.file) || new Set();
    for (const oldRoute of prev) {
      if (!emittedRoutes.has(oldRoute)) {
        const p = routeToOutPath({ outAbs: config.paths.outAbs, route: oldRoute });
        try {
          await fs.rm(p, { force: true });
        } catch {}
      }
    }
    lastEmitted.set(r.file, emittedRoutes);
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
    console.log(`staticapi dev → ${kind}: ${path.relative(process.cwd(), fileAbs)}`);

    if (!info) {
      // File is ignored or no longer maps; delete prior outputs if any
      const prev = lastEmitted.get(fileAbs);
      if (prev) {
        for (const route of prev) {
          const p = routeToOutPath({ outAbs: config.paths.outAbs, route });
          try {
            await fs.rm(p, { force: true });
          } catch {}
        }
        lastEmitted.delete(fileAbs);
      }
      console.log(`[staticapi] (ignored or unmapped)`);
      return;
    }

    const r = { file: fileAbs, route: info.route, type: info.type, segments: info.normSegments };
    try {
      if (r.type === 'static') {
        const files = await emitStatic(r, { fresh: true });
        console.log(`[staticapi] wrote ${files} file(s) for ${r.route}`);
      } else {
        const { written, skipped } = await emitDynamic(r, { fresh: true });
        const extra = skipped ? `, skipped ${skipped}` : '';
        console.log(`[staticapi] wrote ${written} file(s) for ${r.route}${extra}`);
      }
    } catch (err) {
      // Friendly error (already formatted in loaders), just print
      console.error(`[staticapi] ${err?.message || err}`);
    }
  }

  // Initial full build (re-uses existing build pipeline for correctness)
  clearScreen();
  console.log('staticapi dev → initial build…');
  const routes = await mapRoutes({ srcAbs: config.paths.srcAbs });
  for (const r of routes) {
    if (r.type === 'static') await emitStatic(r);
    else await emitDynamic(r);
  }
  console.log(`[staticapi] ready. Watching ${path.relative(process.cwd(), config.paths.srcAbs)}/`);

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
