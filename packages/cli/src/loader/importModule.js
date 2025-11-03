import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

export async function importModule(fileAbs, { fresh = false } = {}) {
  const ext = path.extname(fileAbs).toLowerCase();
  const isTs = ext === '.ts' || ext === '.tsx';

  // Non-TS: import by file URL; OK to use ?v= for cache-busting here.
  if (!isTs) {
    const u = pathToFileURL(fileAbs);
    if (fresh) u.search = `v=${Date.now()}-${Math.random()}`;
    return import(u.href);
  }

  // TS / TSX: transpile, then import via data: URL (no query params allowed!)
  const src = await readFile(fileAbs, 'utf8');
  const isTsx = ext === '.tsx';

  // Make the module body unique when fresh=true so Node doesn’t reuse cache.
  const nonce = fresh ? `\n/*__statikapi_v__=${Date.now()}-${Math.random()}*/` : '';

  const { code } = await transform(src + nonce, {
    loader: isTsx ? 'tsx' : 'ts',
    format: 'esm',
    sourcemap: 'inline',
    target: 'es2022',
    jsx: 'automatic',
    sourcefile: fileAbs, // helps stack traces
  });

  // IMPORTANT: no ?query. Include charset to keep Node happy.
  const href =
    'data:text/javascript;charset=utf-8;base64,' + Buffer.from(code, 'utf8').toString('base64');

  return import(href);
}
