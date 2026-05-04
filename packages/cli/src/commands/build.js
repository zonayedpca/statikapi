import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import { loadConfig } from '../config/loadConfig.js';
import { ConfigError } from '../config/validate.js';
import { loadPaths } from '../loader/loadPaths.js';
import { loadRouteConfig } from '../loader/loadRouteConfig.js';
import { loadModuleValue } from '../loader/loadModuleValue.js';
import { mapRoutes } from '../router/mapRoutes.js';
import {
  collectionRouteForSegments,
  toConcreteRoute,
  toParams,
} from '../router/routeHelpers.js';
import { readFlags } from '../util/readFlags.js';
import { emptyDir, writeFileEnsured } from '../util/fsx.js';
import { formatBytes } from '../util/bytes.js';
import { routeToOutPath } from '../build/routeOutPath.js';

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

    const staticRoutes = routes.filter((r) => r.type === 'static');
    const dynRoutes = routes.filter((r) => r.type === 'dynamic');
    const catRoutes = routes.filter((r) => r.type === 'catchall');

    // prepare outDir (clean, then write)
    await emptyDir(config.paths.outAbs);

    let fileCount = 0;
    let byteCount = 0;
    let skippedDynamic = 0;
    const manifest = []; // array of unified entries
    const emittedByRoute = new Map(); // route -> srcFile

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
      const owner = emittedByRoute.get(route);
      if (owner && owner !== srcFile) {
        throw new Error(
          `Route collision for ${route}: ${relSrc(srcFile)} conflicts with ${relSrc(owner)}`
        );
      }
      emittedByRoute.set(route, srcFile);

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
      const concreteRoute = toConcreteRoute(r.route, segs);
      const params = toParams(r.segments, concreteRoute);
      const val = await loadModuleValue(r.file, { params });
      const json = JSON.stringify(val, null, space) + (pretty ? '\n' : '');
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: concreteRoute });
      await writeFileEnsured(outFile, json);
      fileCount++;
      byteCount += Buffer.byteLength(json);

      await pushManifest({ route: concreteRoute, srcFile: r.file, outFile, json });

      return val;
    }

    async function emitListIndexRoute(r, listIndexCfg, items) {
      if (!listIndexCfg.enabled) return;

      const collectionRoute = collectionRouteForSegments(r.segments);
      if (!collectionRoute) {
        throw new Error(`config.listIndex requires a static parent route for ${r.route}`);
      }

      const payload = items.map((item) => pickItemFields(item, listIndexCfg.pick, r.route));
      const json = JSON.stringify(payload, null, space) + (pretty ? '\n' : '');
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: collectionRoute });
      await writeFileEnsured(outFile, json);
      fileCount++;
      byteCount += Buffer.byteLength(json);

      await pushManifest({ route: collectionRoute, srcFile: r.file, outFile, json });
    }

    // dynamic: expect [['val'], ...] from loadPaths()
    for (const r of dynRoutes) {
      const list = await loadPaths(r.file, r);
      if (!list) {
        skippedDynamic++;
        continue;
      }
      const routeConfig = await loadRouteConfig(r.file);
      const seen = new Set();
      const listItems = [];
      for (const segs of list) {
        const concrete = toConcreteRoute(r.route, segs);
        if (seen.has(concrete)) continue;
        seen.add(concrete);
        const item = await emitConcreteRoute(r, segs);
        listItems.push(item);
      }
      await emitListIndexRoute(r, routeConfig.listIndex, listItems);
    }

    // catch-all: expect [['a','b'], ['guide'], ...]
    for (const r of catRoutes) {
      const list = await loadPaths(r.file, r);
      if (!list) {
        skippedDynamic++;
        continue;
      }
      const routeConfig = await loadRouteConfig(r.file);
      const seen = new Set();
      const listItems = [];
      for (const segs of list) {
        const concrete = toConcreteRoute(r.route, segs);
        if (seen.has(concrete)) continue;
        seen.add(concrete);
        const item = await emitConcreteRoute(r, segs);
        listItems.push(item);
      }
      await emitListIndexRoute(r, routeConfig.listIndex, listItems);
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

function pickItemFields(item, pick, route) {
  if (!pick) return item;
  if (item == null || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`config.listIndex.pick requires plain-object items for ${route}`);
  }

  const out = {};
  for (const key of pick) {
    if (Object.hasOwn(item, key)) out[key] = item[key];
  }
  return out;
}
