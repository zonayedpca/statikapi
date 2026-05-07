import path from 'node:path';

import { cloneListIndexConfig, normalizeListIndexValue } from '../config/listIndex.js';
import { LoaderError } from './errors.js';
import { importModule } from './importModule.js';

export async function loadRouteConfig(fileAbs, { fresh = false, fallback = null } = {}) {
  const fileInfo = short(fileAbs);
  let mod;

  try {
    mod = await importModule(fileAbs, { fresh });
  } catch (e) {
    throw new LoaderError(fileInfo, `Failed to import for config: ${e.message}`);
  }

  return normalizeConfig(mod?.config, fileInfo, fallback);
}

function normalizeConfig(raw, fileInfo, fallback) {
  const base = { listIndex: cloneListIndexConfig(fallback?.listIndex) };

  if (raw == null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LoaderError(fileInfo, `config must be an object when exported`);
  }

  if (!Object.hasOwn(raw, 'listIndex')) return base;

  const listIndex = raw.listIndex;
  try {
    return {
      listIndex: normalizeListIndexValue(listIndex, { label: 'config.listIndex' }),
    };
  } catch (err) {
    if (err instanceof LoaderError) throw err;
    throw new LoaderError(fileInfo, err.message);
  }
}

function short(p) {
  try {
    return path.relative(process.cwd(), p) || p;
  } catch {
    return p;
  }
}
