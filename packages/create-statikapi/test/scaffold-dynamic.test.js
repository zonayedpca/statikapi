import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { makeTmp } from './_tmp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../bin/create-statikapi.js');

function runScaffold(cwd, args = []) {
  return new Promise((resolve, reject) => {
    // NOTE: Do NOT pass BIN inside args; we already pass it as the executable.
    execFile(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

test('scaffolds DYNAMIC template with users/:id and docs/*slug examples', async (t) => {
  const tmp = await makeTmp();
  const appName = 'my-dynamic-api';

  // remove BIN from the arg list
  await runScaffold(tmp.cwd, [appName, '--yes', '--template', 'dynamic', '--no-install']);

  const base = tmp.join(appName, 'src-api');

  // Expected files
  const expects = ['index.js', 'users/[id].js', 'docs/[...slug].js'];
  for (const rel of expects) {
    assert.ok(await fileExists(path.join(base, rel)), `missing ${rel}`);
  }

  // Validate contents mention paths() and params usage
  const users = await fs.readFile(path.join(base, 'users/[id].js'), 'utf8');
  assert.match(users, /export\s+async\s+function\s+paths\(\)/, 'users/[id].js must export paths()');
  assert.match(users, /params\.id/, 'users/[id].js should access params.id');

  const docs = await fs.readFile(path.join(base, 'docs/[...slug].js'), 'utf8');
  assert.match(
    docs,
    /export\s+async\s+function\s+paths\(\)/,
    'docs/[...slug].js must export paths()'
  );
  assert.match(docs, /params\.slug/, 'docs/[...slug].js should access params.slug');

  t.after(async () => {
    await tmp.cleanup();
  });
});
