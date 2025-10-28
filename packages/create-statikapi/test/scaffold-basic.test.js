import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeTmp } from './_tmp.js';

const BIN = path.resolve('packages/create-statikapi/bin/create-statikapi.js');

function runScaffold(cwd, args = []) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [BIN, ...args], // <- only one BIN here
      { cwd, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) return reject(Object.assign(err, { stdout, stderr }));
        resolve({ stdout, stderr });
      }
    );
  });
}

test('scaffolds BASIC template without installing deps', async (t) => {
  const tmp = await makeTmp();
  const appName = 'my-basic-api';

  // DO NOT include BIN in the args:
  await runScaffold(tmp.cwd, [
    appName,
    '--yes',
    '--template',
    'basic',
    '--no-install',
    '--package-manager',
    'pnpm',
  ]);

  const appDir = tmp.join(appName);

  // Files/directories exist
  const expected = ['src-api/index.js', 'package.json', 'README.md', '.gitignore'];
  for (const rel of expected) {
    const stat = await fs.stat(path.join(appDir, rel)).catch(() => null);
    assert.ok(stat && stat.isFile(), `expected file missing: ${rel}`);
  }

  // package.json sanity
  const pkg = JSON.parse(await fs.readFile(path.join(appDir, 'package.json'), 'utf8'));
  assert.equal(pkg.name, appName);
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.devDependencies?.statikapi, 'statikapi should be a devDependency');
  assert.deepEqual(Object.keys(pkg.scripts || {}), ['dev', 'build', 'preview']);

  // src-api/index.js should export default plain object
  const src = await fs.readFile(path.join(appDir, 'src-api', 'index.js'), 'utf8');
  assert.match(src, /export\s+default\s+{/, 'index.js should default-export an object');

  // (optional) ensure deps were not installed
  await assert.rejects(() => fs.stat(path.join(appDir, 'node_modules')), /ENOENT/);

  t.after(async () => {
    await tmp.cleanup();
  });
});
