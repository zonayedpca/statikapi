import { test } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BIN = resolve(__dirname, '../bin/staticapi.js');

function run(args = []) {
  return new Promise((resolvePromise, reject) => {
    execFile(process.execPath, [BIN, ...args], { env: process.env }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

test('staticapi -v prints version', async () => {
  const { stdout } = await run(['-v']);
  assert.match(stdout, /staticapi v0\.1\.0/);
});

test('staticapi build prints build messages', async () => {
  const { stdout } = await run(['build']);
  assert.match(stdout, /Building static API/);
  assert.match(stdout, /hello, staticapi/);
});

test('bin has executable bit', () => {
  const st = fs.statSync(resolve('packages/cli/bin/staticapi.js'));
  // owner executable bit
  if (process.platform !== 'win32') {
    if ((st.mode & 0o100) === 0) throw new Error('bin is not executable');
  }
});
