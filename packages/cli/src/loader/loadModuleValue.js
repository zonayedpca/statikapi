import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LoaderError } from './errors.js';
import { assertSerializable } from './serializeGuard.js';

/**
 * Load a module file (ESM or CJS), resolve its value:
 *  - if it exports `async function data()`, call it (no args) and await.
 *  - else if default export is a function, call and await.
 *  - else if default export is a value, use it.
 * Then verify JSON-serializability.
 */
export async function loadModuleValue(fileAbs) {
  const fileInfo = short(fileAbs);
  let mod;
  try {
    mod = await import(pathToFileURL(fileAbs).href);
  } catch (e) {
    throw new LoaderError(fileInfo, `Failed to import: ${e.message}`);
  }

  let producer = null;
  if (typeof mod?.data === 'function') producer = mod.data;
  else if (typeof mod?.default === 'function') producer = mod.default;

  let value;
  try {
    if (producer) value = await producer();
    else if ('default' in (mod || {})) value = mod.default;
    else
      throw new LoaderError(
        fileInfo,
        `No export found. Use 'export async function data()' or 'export default <value|function>'.`
      );
  } catch (e) {
    if (e instanceof LoaderError) throw e;
    throw new LoaderError(fileInfo, `Error executing module: ${e.message}`);
  }

  try {
    assertSerializable(value, '$');
  } catch (e) {
    throw new LoaderError(fileInfo, `Not JSON-serializable: ${e.message}`);
  }

  return value;
}

function short(p) {
  // Show path relative to repo root for nicer messages
  try {
    return path.relative(process.cwd(), p) || p;
  } catch {
    return p;
  }
}
