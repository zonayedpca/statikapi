import { readFlags } from '../util/readFlags.js'; // from Task 3
import { loadConfig } from '../config/loadConfig.js'; // from Task 3
import { ConfigError } from '../config/validate.js'; // from Task 3
import { mapRoutes } from '../router/mapRoutes.js'; // from Task 4
import { loadModuleValue } from '../loader/loadModuleValue.js'; // from Task 5
import { loadPaths } from '../loader/loadPaths.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import { emptyDir, writeFileEnsured } from '../util/fsx.js';
import { routeToOutPath } from '../build/routeOutPath.js';
import { formatBytes } from '../util/bytes.js';

function toConcrete(routePattern, segTokens, segs) {
  // segTokens: ['users', ':id'] or ['docs','*slug']
  // segs: ['1'] or ['a','b']
  let idx = 0;
  const parts = routePattern.split('/').map((p) => {
    if (p.startsWith(':')) return segs[idx++] ?? '';
    if (p.startsWith('*')) return segs.slice(idx).join('/');
    return p;
  });
  const concrete = parts.join('/').replace(/\/+/g, '/');
  return concrete;
}

function toParams(segTokens, concreteRoute) {
  const concreteSegs = concreteRoute.split('/').filter(Boolean);
  const params = {};

  for (let i = 0; i < segTokens.length; i++) {
    const tok = segTokens[i];
    if (tok.startsWith(':')) {
      params[tok.slice(1)] = concreteSegs[i] ?? '';
    } else if (tok.startsWith('*')) {
      params[tok.slice(1)] = concreteSegs.slice(i);
      break;
    }
  }
  return params;
}

export default async function buildCmd(argv) {
  const t0 = Date.now();
  try {
    const flags = readFlags(argv);
    const { config } = await loadConfig({ flags });

    const pretty = flags.pretty === true || flags.minify === false;
    const space = pretty ? 2 : 0;

    // keep legacy-friendly stub line so the old test passes
    console.log('statikapi build → building JSON endpoints (MVP)');

    // discover routes
    const routes = await mapRoutes({ srcAbs: config.paths.srcAbs });

    // MVP: only handle static routes (dynamic/catch-all in next task)
    const staticRoutes = routes.filter((r) => r.type === 'static');
    const dynRoutes = routes.filter((r) => r.type === 'dynamic');
    const catRoutes = routes.filter((r) => r.type === 'catchall');

    // prepare outDir (clean, then write)
    await emptyDir(config.paths.outAbs);

    let fileCount = 0;
    let byteCount = 0;
    let skippedDynamic = 0;
    const manifest = []; // array of unified entries

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

    async function pushManifest({ route, srcFile, outFile, json }) {
      const st = await fs.stat(outFile).catch(() => null);
      const entry = {
        // stable field order
        route,
        outFile: relOut(outFile),
        srcFile: relSrc(srcFile),
        // backward-compat (old tests read filePath → output path)
        filePath: relOut(outFile),
        bytes: Buffer.byteLength(json),
        mtime: st ? st.mtimeMs : Date.now(),
        hash: digest(json),
        revalidate: null,
      };
      manifest.push(entry);
    }

    for (const r of staticRoutes) {
      const val = await loadModuleValue(r.file);
      const json = JSON.stringify(val, null, space) + (pretty ? '\n' : '');
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: r.route });
      await writeFileEnsured(outFile, json);
      fileCount++;
      byteCount += Buffer.byteLength(json);

      await pushManifest({ route: r.route, srcFile: r.file, outFile, json });
    }

    // helper: materialize a concrete route from tokens + param segments
    async function emitConcreteRoute(r, segs) {
      const concreteRoute = toConcrete(r.route, r.segments, segs);
      const params = toParams(r.segments, concreteRoute);
      const val = await loadModuleValue(r.file, { params });
      const json = JSON.stringify(val, null, space) + (pretty ? '\n' : '');
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: concreteRoute });
      await writeFileEnsured(outFile, json);
      fileCount++;
      byteCount += Buffer.byteLength(json);

      await pushManifest({ route: concreteRoute, srcFile: r.file, outFile, json });
    }

    // dynamic: expect [['val'], ...] from loadPaths()
    for (const r of dynRoutes) {
      const list = await loadPaths(r.file, r);
      if (!list) {
        skippedDynamic++;
        continue;
      }
      const seen = new Set();
      for (const segs of list) {
        const concrete = toConcrete(r.route, r.segments, segs);
        if (seen.has(concrete)) continue;
        seen.add(concrete);
        await emitConcreteRoute(r, segs);
      }
    }

    // catch-all: expect [['a','b'], ['guide'], ...]
    for (const r of catRoutes) {
      const list = await loadPaths(r.file, r);
      if (!list) {
        skippedDynamic++;
        continue;
      }
      const seen = new Set();
      for (const segs of list) {
        const concrete = toConcrete(r.route, r.segments, segs);
        if (seen.has(concrete)) continue;
        seen.add(concrete);
        await emitConcreteRoute(r, segs);
      }
    }

    // Write manifest once (sorted for determinism)
    const manifestPath = path.join(config.paths.outAbs, '.statikapi', 'manifest.json');
    const sorted = manifest.sort((a, b) => a.route.localeCompare(b.route));
    const manifestJson = JSON.stringify(sorted, null, pretty ? 2 : 0) + (pretty ? '\n' : '');
    await writeFileEnsured(manifestPath, manifestJson);
    byteCount += Buffer.byteLength(manifestJson);
    fileCount++;

    const elapsed = Date.now() - t0;

    const extra = skippedDynamic ? `, skipped ${skippedDynamic} dynamic route(s)` : '';
    console.log(
      `[statikapi] wrote ${fileCount} file(s), ${formatBytes(byteCount)} in ${elapsed} ms${extra}`
    );
    return 0;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[statikapi] Config error: ${err.message}`);
      return 1;
    }
    // LoaderError already includes file path; show as-is
    if (err && err.name === 'LoaderError') {
      console.error(`[statikapi] ${err.message}`);
      return 1;
    }
    console.error('[statikapi] Build failed:', err?.stack || err?.message || err);
    return 1;
  }
}
