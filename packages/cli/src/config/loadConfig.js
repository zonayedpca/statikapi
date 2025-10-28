import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_CONFIG } from './defaults.js';
import { validateAndNormalize, ConfigError } from './validate.js';

export async function loadConfig({ cwd = process.cwd(), flags = {} } = {}) {
  const file = path.join(cwd, 'statikapi.config.js');
  let fromFile = false;
  let fileCfg = {};

  try {
    await fs.access(file);
    fromFile = true;
    const mod = await import(pathToFileURL(file).href);
    fileCfg = (mod?.default ?? mod?.config ?? mod) || {};
    if (typeof fileCfg !== 'object' || fileCfg == null || Array.isArray(fileCfg)) {
      throw new ConfigError('Config file must export an object (default or named "config")');
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      const e = err instanceof Error ? err : new Error(String(err));
      e.message = `Failed to load "statikapi.config.js": ${e.message}`;
      throw e;
    }
    // no config file → fine
  }

  // Merge: defaults <- file <- flags
  const merged = {
    ...DEFAULT_CONFIG,
    ...fileCfg,
    ...pickFlags(flags),
  };

  // Validate & expand absolute paths
  const finalCfg = validateAndNormalize(merged, { cwd });
  return { config: finalCfg, source: { fromFile, filePath: file } };
}

function pickFlags(flags) {
  const o = {};
  if (flags.srcDir != null) o.srcDir = String(flags.srcDir);
  if (flags.outDir != null) o.outDir = String(flags.outDir);
  return o;
}
