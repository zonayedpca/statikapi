import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BIN = path.resolve('packages/cli/bin/staticapi.js');

test('build writes static JSON files and prints summary', async (t) => {
  // temp src
  await fs.rm('src-api', { recursive: true, force: true });
  await fs.mkdir('src-api/blog', { recursive: true });
  await fs.writeFile('src-api/index.js', 'export default {hello:"world"}\n');
  await fs.writeFile('src-api/blog/archive.js', 'export default {page:"archive"}\n');

  const stdout = execFileSync(process.execPath, [BIN, 'build'], { encoding: 'utf8' });
  assert.match(stdout, /wrote \d+ file\(s\), .* in \d+ ms/);

  const a = await fs.readFile('api-out/index.json', 'utf8');
  const b = await fs.readFile('api-out/blog/archive/index.json', 'utf8');
  assert.equal(JSON.parse(a).hello, 'world');
  assert.equal(JSON.parse(b).page, 'archive');

  t.after(async () => {
    await fs.rm('src-api', { recursive: true, force: true });
    await fs.rm('api-out', { recursive: true, force: true });
  });
});
