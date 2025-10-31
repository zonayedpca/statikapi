import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = resolve(__dirname, '../bin/statikapi.js');

function run(args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, ...args], (err, stdout, stderr) => {
      if (err)
        return reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) }));
      resolve({ stdout: String(stdout) });
    });
  });
}

test('--help lists commands', async () => {
  const { stdout } = await run(['--help']);
  for (const word of ['init', 'build', 'dev', 'preview']) {
    assert.match(stdout, new RegExp(`\\b${word}\\b`));
  }
});

for (const [cmd, text] of [
  ['build', 'building'],
  ['dev', 'starting'],
]) {
  test(`${cmd} prints stub output`, async () => {
    const { stdout } = await run([cmd]);
    assert.match(stdout.toLowerCase(), new RegExp(text));
  });
}
