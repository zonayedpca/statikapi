import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleValue } from '../src/loader/loadModuleValue.js';

const FIX = path.resolve('packages/cli/test/loader.fixture');

function f(name) {
  return path.join(FIX, name);
}

test('ESM default value', async () => {
  const v = await loadModuleValue(f('esm-value.js'));

  assert.deepEqual(v, { ok: 1 });
});

test('ESM data() function', async () => {
  const v = await loadModuleValue(f('esm-fn.js'));

  assert.deepEqual(v, { ok: 2 });
});

test('ESM default function', async () => {
  const v = await loadModuleValue(f('esm-fn-default.js'));

  assert.deepEqual(v, { ok: 3 });
});

test('CJS default value', async () => {
  const v = await loadModuleValue(f('cjs-value.cjs'));

  assert.deepEqual(v, { ok: 4 });
});

test('CJS default function', async () => {
  const v = await loadModuleValue(f('cjs-fn.cjs'));

  assert.deepEqual(v, { ok: 5 });
});

test('rejects value containing a function', async () => {
  await assert.rejects(
    () => loadModuleValue(f('bad-func.js')),
    /Not JSON-serializable: Function is not JSON-serializable/
  );
});

test('rejects circular structures', async () => {
  await assert.rejects(
    () => loadModuleValue(f('bad-cycle.js')),
    /Not JSON-serializable: Circular structure detected/
  );
});

test('rejects non-plain objects (e.g., Date)', async () => {
  await assert.rejects(
    () => loadModuleValue(f('bad-nonplain.js')),
    /Not JSON-serializable: Only plain objects\/arrays allowed/
  );
});

test('rejects non-finite numbers', async () => {
  await assert.rejects(
    () => loadModuleValue(f('bad-number.js')),
    /Not JSON-serializable: Number must be finite/
  );
});
