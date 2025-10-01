import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadModulePaths, LoaderError } from '../src/loader/loadModulePaths.js';

const FIX = (name) => path.resolve(`packages/cli/test/paths.fixture/${name}`);

test('returns [] when no paths() export', async () => {
  const out = await loadModulePaths(FIX('noPaths.js'));
  assert.deepEqual(out, []);
});

test('ok paths() returns array of plain objects', async () => {
  const out = await loadModulePaths(FIX('okPaths.js'));
  assert.deepEqual(out, [{ slug: 'a' }, { slug: 'b' }]);
});

test('paths() must return an array', async () => {
  await assert.rejects(
    () => loadModulePaths(FIX('badReturn.js')),
    (e) => e instanceof LoaderError && /must return an array/.test(e.message)
  );
});

test('entries must be plain objects', async () => {
  await assert.rejects(
    () => loadModulePaths(FIX('badEntry.js')),
    (e) => e instanceof LoaderError && /entries must be plain objects/.test(e.message)
  );
  await assert.rejects(
    () => loadModulePaths(FIX('badObject.js')),
    (e) => e instanceof LoaderError && /entries must be plain objects/.test(e.message)
  );
});

test('dedupes identical param objects', async () => {
  const out = await loadModulePaths(FIX('duplicate.js'));
  assert.deepEqual(out, [{ slug: 'a' }]);
});
