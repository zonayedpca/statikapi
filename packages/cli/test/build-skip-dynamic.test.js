import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { makeTmp } from './_tmp.js';

const BIN = path.resolve('packages/cli/bin/statikapi.js');

test('skips dynamic routes without paths()', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(tmp.join('src-api/index.js'), 'export default {ok:true}\n');
  await fs.writeFile(tmp.join('src-api/users/[id].js'), 'export default {hint:"runtime-only"}\n');

  const out = execFileSync(process.execPath, [BIN, 'build'], {
    encoding: 'utf8',
    cwd: tmp.cwd,
  });
  assert.match(out, /skipped 1 dynamic route/);

  const root = JSON.parse(await fs.readFile(tmp.join('api-out/index.json'), 'utf8'));
  assert.equal(root.ok, true);

  await assert.rejects(() => fs.readFile(tmp.join('api-out/users/1/index.json'), 'utf8'));

  t.after(async () => {
    await tmp.cleanup();
  });
});
