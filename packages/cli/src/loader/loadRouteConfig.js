import path from 'node:path';

import { LoaderError } from './errors.js';
import { importModule } from './importModule.js';

export async function loadRouteConfig(fileAbs, { fresh = false } = {}) {
  const fileInfo = short(fileAbs);
  let mod;

  try {
    mod = await importModule(fileAbs, { fresh });
  } catch (e) {
    throw new LoaderError(fileInfo, `Failed to import for config: ${e.message}`);
  }

  return normalizeConfig(mod?.config, fileInfo);
}

function normalizeConfig(raw, fileInfo) {
  const base = { listIndex: { enabled: false, pick: null } };

  if (raw == null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LoaderError(fileInfo, `config must be an object when exported`);
  }

  const listIndex = raw.listIndex;
  if (listIndex == null || listIndex === false) return base;
  if (listIndex === true) return { listIndex: { enabled: true, pick: null } };

  if (typeof listIndex !== 'object' || Array.isArray(listIndex)) {
    throw new LoaderError(fileInfo, `config.listIndex must be true, false, or an object`);
  }

  const enabled = listIndex.enabled == null ? true : listIndex.enabled;
  if (typeof enabled !== 'boolean') {
    throw new LoaderError(fileInfo, `config.listIndex.enabled must be a boolean`);
  }

  let pick = null;
  if ('pick' in listIndex) {
    if (!Array.isArray(listIndex.pick)) {
      throw new LoaderError(fileInfo, `config.listIndex.pick must be an array of strings`);
    }
    for (const key of listIndex.pick) {
      if (typeof key !== 'string' || !key) {
        throw new LoaderError(fileInfo, `config.listIndex.pick must contain non-empty strings`);
      }
    }
    pick = Array.from(new Set(listIndex.pick));
  }

  return { listIndex: { enabled, pick } };
}

function short(p) {
  try {
    return path.relative(process.cwd(), p) || p;
  } catch {
    return p;
  }
}
