import { readFlags } from '../util/readFlags.js'; // from Task 3
import { loadConfig } from '../config/loadConfig.js'; // from Task 3
import { ConfigError } from '../config/validate.js'; // from Task 3
import { mapRoutes } from '../router/mapRoutes.js'; // from Task 4
import { loadModuleValue } from '../loader/loadModuleValue.js'; // from Task 5

import { emptyDir, writeFileEnsured } from '../util/fsx.js';
import { routeToOutPath } from '../build/routeOutPath.js';
import { formatBytes } from '../util/bytes.js';

export default async function buildCmd(argv) {
  const t0 = Date.now();
  try {
    const flags = readFlags(argv);
    const { config } = await loadConfig({ flags });

    const pretty = flags.pretty === true || flags.minify === false;
    const space = pretty ? 2 : 0;

    // keep legacy-friendly stub line so the old test passes
    console.log('staticapi build → building JSON endpoints (MVP)');

    // discover routes
    const routes = await mapRoutes({ srcAbs: config.paths.srcAbs });

    // MVP: only handle static routes (dynamic/catch-all in next task)
    const staticRoutes = routes.filter((r) => r.type === 'static');

    // prepare outDir (clean, then write)
    await emptyDir(config.paths.outAbs);

    let fileCount = 0;
    let byteCount = 0;

    for (const r of staticRoutes) {
      const val = await loadModuleValue(r.file);
      const json = JSON.stringify(val, null, space) + (pretty ? '\n' : '');
      const outFile = routeToOutPath({ outAbs: config.paths.outAbs, route: r.route });
      await writeFileEnsured(outFile, json);
      fileCount++;
      byteCount += Buffer.byteLength(json);
    }

    const elapsed = Date.now() - t0;
    console.log(
      `[staticapi] wrote ${fileCount} file(s), ${formatBytes(byteCount)} in ${elapsed} ms`
    );
    return 0;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[staticapi] Config error: ${err.message}`);
      return 1;
    }
    // LoaderError already includes file path; show as-is
    if (err && err.name === 'LoaderError') {
      console.error(`[staticapi] ${err.message}`);
      return 1;
    }
    console.error('[staticapi] Build failed:', err?.stack || err?.message || err);
    return 1;
  }
}
