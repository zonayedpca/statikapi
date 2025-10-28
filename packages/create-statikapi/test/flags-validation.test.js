import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmp } from './_tmp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../bin/create-statikapi.js');

function run(args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], opts, (err, stdout, stderr) => {
      const code = err ? (err.code ?? 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

test('errors on invalid template name', async () => {
  const tmp = await makeTmp();
  const { code, stdout, stderr } = await run(['weird-app', '--yes', '--template', 'nope'], {
    cwd: tmp.cwd,
    encoding: 'utf8',
  });
  assert.notEqual(code, 0, 'should exit non-zero');
  assert.match(stdout + stderr, /invalid template/i, 'should mention invalid template');
});

test('prints help with --help', async () => {
  const { code, stdout } = await run(['--help'], { encoding: 'utf8' });
  assert.equal(code, 0);
  for (const word of ['--template', '--no-install', '--yes']) {
    assert.match(stdout, new RegExp(word));
  }
});
