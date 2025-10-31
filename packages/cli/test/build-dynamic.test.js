import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { makeTmp } from './_tmp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BIN = path.resolve(__dirname, '../bin/statikapi.js');

test('build emits dynamic and catch-all routes via paths()', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.mkdir(tmp.join('src-api/docs'), { recursive: true });

  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export async function paths(){ return ['1','2']; }
export async function data({ params }){ return { user: params.id }; }
`
  );
  await fs.writeFile(
    tmp.join('src-api/docs/[...slug].js'),
    `
export async function paths(){ return [['a','b'], ['guide']]; }
export async function data({ params }){ return { doc: params.slug.join('/') }; }
`
  );

  const { stdout, stderr, code } = await new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, 'build', '--pretty'],
      { cwd: tmp.cwd, encoding: 'utf8' },
      (err, stdout, stderr) => resolve({ stdout, stderr, code: err ? (err.code ?? 1) : 0 })
    );
  });

  if (code !== 0) {
    throw new Error(`CLI exited with ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }
  assert.match(stdout, /wrote \d+ file/);

  const u1 = JSON.parse(await fs.readFile(tmp.join('api-out/users/1/index.json'), 'utf8'));
  const u2 = JSON.parse(await fs.readFile(tmp.join('api-out/users/2/index.json'), 'utf8'));
  const d1 = JSON.parse(await fs.readFile(tmp.join('api-out/docs/a/b/index.json'), 'utf8'));
  const d2 = JSON.parse(await fs.readFile(tmp.join('api-out/docs/guide/index.json'), 'utf8'));

  assert.equal(u1.user, '1');
  assert.equal(u2.user, '2');
  assert.equal(d1.doc, 'a/b');
  assert.equal(d2.doc, 'guide');

  t.after(async () => {
    await tmp.cleanup();
  });
});
