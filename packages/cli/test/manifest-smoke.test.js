import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTmp } from './_tmp.js';

const BIN = path.resolve('packages/cli/bin/statikapi.js');

test('build writes a manifest with basic fields', async (t) => {
  const tmp = await makeTmp();

  // ensure src-api exists
  await fs.mkdir(tmp.join('src-api'), { recursive: true });

  // minimal API
  await fs.writeFile(tmp.join('src-api/index.js'), 'export default {ok:true}\n');

  // run build
  execFileSync(process.execPath, [BIN, 'build'], {
    encoding: 'utf8',
    cwd: tmp.cwd,
  });

  // read manifest
  const manifestPath = tmp.join('api-out/.statikapi/manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error(`manifest is not valid JSON:\n${raw}`);
  }

  // basic structure checks
  assert(Array.isArray(list), 'manifest should be an array');
  assert(list.length >= 1, 'manifest should contain at least one entry');

  // ensure root route is present and fields look sane
  const root = list.find((e) => e.route === '/');
  assert(root, 'manifest should include entry for "/"');

  // required fields
  for (const k of ['route', 'filePath', 'bytes', 'mtime', 'hash']) {
    assert.ok(k in root, `manifest entry missing "${k}"`);
  }

  assert.equal(typeof root.route, 'string');
  assert.equal(typeof root.filePath, 'string');
  assert.equal(typeof root.bytes, 'number');
  assert.ok(['number', 'string'].includes(typeof root.mtime));
  assert.equal(typeof root.hash, 'string');
  assert.ok(root.hash.length > 0, 'hash should be non-empty');

  // filePath should point into api-out and end with index.json
  assert.match(root.filePath.replaceAll(path.sep, '/'), /^api-out\/.*index\.json$/);

  t.after(async () => {
    await tmp.cleanup();
  });
});
