import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { makeTmp } from './_tmp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../bin/statikapi.js');

test('build writes static JSON files and prints summary', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/blog'), { recursive: true });
  await fs.writeFile(tmp.join('src-api/index.js'), 'export default {hello:"world"}\n');
  await fs.writeFile(tmp.join('src-api/blog/archive.js'), 'export default {page:"archive"}\n');

  const stdout = execFileSync(process.execPath, [BIN, 'build'], {
    encoding: 'utf8',
    cwd: tmp.cwd,
  });
  assert.match(stdout, /wrote \d+ file\(s\), .* in \d+ ms/);

  const a = await fs.readFile(tmp.join('api-out/index.json'), 'utf8');
  const b = await fs.readFile(tmp.join('api-out/blog/archive/index.json'), 'utf8');
  assert.equal(JSON.parse(a).hello, 'world');
  assert.equal(JSON.parse(b).page, 'archive');

  t.after(async () => {
    await tmp.cleanup();
  });
});
