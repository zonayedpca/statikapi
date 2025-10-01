import { pathToFileURL } from 'node:url';

export class LoaderError extends Error {
  constructor(message, file) {
    super(file ? `[module:${file}] ${message}` : message);
    this.name = 'LoaderError';
  }
}

export async function loadModulePaths(fileAbs) {
  let mod;
  try {
    mod = await import(pathToFileURL(fileAbs).href);
  } catch (e) {
    throw new LoaderError(`failed to import module: ${e?.message || e}`, fileAbs);
  }

  const fn = mod?.paths;
  if (fn == null) return []; // no paths() → static module
  if (typeof fn !== 'function') {
    throw new LoaderError(`"paths" export must be a function`, fileAbs);
  }

  let result;
  try {
    result = await fn();
  } catch (e) {
    throw new LoaderError(`paths() threw: ${e?.message || e}`, fileAbs);
  }

  if (!Array.isArray(result)) {
    throw new LoaderError(`paths() must return an array of objects`, fileAbs);
  }

  // Validate each entry is a plain object
  const unique = new Map(); // stable-key → original object
  for (const entry of result) {
    if (!isPlainObject(entry)) {
      throw new LoaderError(
        `paths() entries must be plain objects (e.g., { id: "123" }). Got: ${describe(entry)}`,
        fileAbs
      );
    }
    const key = stableKey(entry);
    if (!unique.has(key)) unique.set(key, entry); // simple de-dupe
  }

  return [...unique.values()];
}

// ---- utils ----
function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function stableKey(obj) {
  const keys = Object.keys(obj).sort();
  const flat = {};
  for (const k of keys) flat[k] = obj[k];
  return JSON.stringify(flat);
}

function describe(v) {
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}
