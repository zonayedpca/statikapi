import { readFlags } from '../util/readFlags.js';
import { loadConfig } from '../config/loadConfig.js';
import { ConfigError } from '../config/validate.js';

export default async function buildCmd(argv) {
  try {
    const flags = readFlags(argv);
    const { config, source } = await loadConfig({ flags });

    // DoD: print merged/effective config
    console.log('[staticapi] config:');
    console.log(
      JSON.stringify(
        {
          srcDir: config.srcDir,
          outDir: config.outDir,
          paths: config.paths,
          _source: source,
        },
        null,
        2
      )
    );

    console.log('staticapi build → building JSON endpoints (stub)');
    return 0;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[staticapi] Config error: ${err.message}`);
      return 1;
    }
    console.error('[staticapi] Unexpected error in build:', err?.stack || err?.message || err);
    return 1;
  }
}
