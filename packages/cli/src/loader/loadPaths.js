import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LoaderError } from './errors.js';

export async function loadPaths(fileAbs, { route, type, segments }, { fresh = false } = {}) {
  const fileInfo = short(fileAbs);
  let mod;

  try {
    const u = new URL(pathToFileURL(fileAbs).href);
    if (fresh) u.search = `v=${Date.now()}-${Math.random()}`;
    mod = await import(u.href);
  } catch (e) {
    throw new LoaderError(fileInfo, `Failed to import for paths(): ${e.message}`);
  }

  if (typeof mod?.paths !== 'function') return null;

  let res;

  try {
    res = await mod.paths();
  } catch (e) {
    throw new LoaderError(fileInfo, `paths() threw: ${e.message}`);
  }
  if (!Array.isArray(res)) {
    throw new LoaderError(fileInfo, `paths() must return an array`);
  }

  if (type === 'dynamic') {
    // /users/:id → string[]
    for (const v of res) {
      if (typeof v !== 'string')
        throw new LoaderError(fileInfo, `paths() for ${route} must be string[]`);
      if (!v)
        throw new LoaderError(
          fileInfo,
          `paths() entry for :${paramName(segments)} cannot be empty`
        );
      if (v.includes('/'))
        throw new LoaderError(
          fileInfo,
          `paths() entry for :${paramName(segments)} must not contain '/'`
        );
    }

    return res.map((v) => [v]); // normalize to array-of-segments
  }

  if (type === 'catchall') {
    // /docs/*slug → (string | string[])[]
    const out = [];

    for (const v of res) {
      if (typeof v === 'string') {
        if (!v)
          throw new LoaderError(
            fileInfo,
            `paths() entry for *${paramName(segments)} must be non-empty`
          );
        out.push([v]);
      } else if (Array.isArray(v)) {
        if (v.length === 0) {
          throw new LoaderError(
            fileInfo,
            `paths() entry for *${paramName(segments)} must be non-empty`
          );
        }
        for (const s of v) {
          if (typeof s !== 'string' || !s) {
            throw new LoaderError(
              fileInfo,
              `paths() entry for *${paramName(segments)} must contain non-empty strings`
            );
          }
          if (s.includes('/')) {
            throw new LoaderError(
              fileInfo,
              `paths() entry segment for *${paramName(segments)} must not contain '/'`
            );
          }
        }
        out.push(v);
      } else {
        throw new LoaderError(fileInfo, `paths() for ${route} must be (string | string[])[]`);
      }
    }

    return out;
  }

  // static shouldn't have paths()
  return null;
}

function paramName(segTokens) {
  // segTokens like ['users', ':id'] or ['docs','*slug']
  const tok = segTokens.find((t) => t.startsWith(':') || t.startsWith('*'));

  return tok ? tok.slice(1) : 'param';
}

function short(p) {
  try {
    return path.relative(process.cwd(), p) || p;
  } catch {
    return p;
  }
}
