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
    execFile(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

test('scaffolds CLOUDFLARE template with static assets, private storage, config, and deploy wiring', async (t) => {
  const tmp = await makeTmp();
  const appName = 'my-cloudflare-api';

  await runScaffold(tmp.cwd, [
    appName,
    '--yes',
    '--template',
    'cloudflare-adapter',
    '--no-install',
  ]);

  const appDir = tmp.join(appName);
  const requiredFiles = [
    'src-api/index.js',
    'wrangler.toml',
    'statikapi.config.js',
    '.dev.vars',
    'package.json',
  ];

  for (const rel of requiredFiles) {
    const stat = await fs.stat(path.join(appDir, rel)).catch(() => null);
    assert.ok(stat && stat.isFile(), `expected file missing: ${rel}`);
  }

  const pkg = JSON.parse(await fs.readFile(path.join(appDir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.deploy, 'statikapi-cf deploy');
  assert.equal(pkg.scripts.dev, 'statikapi-cf dev --worker-port 8787 --port 8788');
  assert.equal(
    pkg.scripts.preview,
    'statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788'
  );
  assert.ok(!pkg.devDependencies.concurrently);
  assert.ok(!pkg.devDependencies['chokidar-cli']);

  const wrangler = await fs.readFile(path.join(appDir, 'wrangler.toml'), 'utf8');
  assert.match(wrangler, /\[assets\]/);
  assert.match(wrangler, /directory = "\.\/public"/);
  assert.match(wrangler, /binding = "ASSETS"/);
  assert.doesNotMatch(wrangler, /run_worker_first/);
  assert.match(wrangler, /STATIK_PRIVATE_BUCKET/);
  assert.match(wrangler, /STATIK_WORKER_REQUEST_LIMIT/);
  assert.match(wrangler, /STATIK_R2_CLASS_A_LIMIT/);
  assert.match(wrangler, /STATIK_R2_CLASS_B_LIMIT/);
  assert.doesNotMatch(wrangler, /STATIK_PUBLIC_BUCKET/);
  assert.doesNotMatch(wrangler, /STATIK_BUILD_TOKEN/);
  assert.doesNotMatch(wrangler, /STATIK_PRIVATE_AUTH_HEADER_NAME/);
  assert.doesNotMatch(wrangler, /STATIK_PRIVATE_AUTH_HEADER_VALUE/);

  const config = await fs.readFile(path.join(appDir, 'statikapi.config.js'), 'utf8');
  assert.doesNotMatch(config, /servingMode/);
  assert.match(config, /publicByDefault: true/);
  assert.match(config, /webhook: true/);

  const envTemplate = await fs.readFile(path.join(appDir, '.dev.vars'), 'utf8');
  assert.match(envTemplate, /CLOUDFLARE_ACCOUNT_ID=/);
  assert.match(envTemplate, /CLOUDFLARE_API_TOKEN=/);
  assert.match(envTemplate, /STATIK_BUILD_TOKEN=/);
  assert.match(envTemplate, /STATIK_PRIVATE_AUTH_HEADER_NAME=/);
  assert.match(envTemplate, /STATIK_PRIVATE_AUTH_HEADER_VALUE=/);
  assert.match(envTemplate, /STATIK_DEPLOY_ORIGIN=/);
  await assert.rejects(fs.stat(path.join(appDir, '.dev.vars.example')));

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('cloudflare scaffold accepts custom source and static assets directories', async (t) => {
  const tmp = await makeTmp();
  const appName = 'my-cloudflare-assets-dir';

  await runScaffold(tmp.cwd, [
    appName,
    '--yes',
    '--template',
    'cloudflare-adapter',
    '--no-install',
    '--assets-dir=static-output',
    '--src-dir=api-src',
  ]);

  const appDir = tmp.join(appName);
  const expectedFiles = ['wrangler.toml', 'package.json', 'README.md', '.dev.vars'];

  for (const rel of expectedFiles) {
    const stat = await fs.stat(path.join(appDir, rel)).catch(() => null);
    assert.ok(stat && stat.isFile(), `expected file missing: ${rel}`);
  }

  await assert.rejects(fs.stat(path.join(appDir, '.dev.vars.example')));

  const pkg = JSON.parse(await fs.readFile(path.join(appDir, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'statikapi-cf --src api-src --out dist/worker.mjs');

  const wrangler = await fs.readFile(path.join(appDir, 'wrangler.toml'), 'utf8');
  assert.match(wrangler, /directory = "\.\/static-output"/);
  assert.match(wrangler, /STATIK_SRC = "api-src"/);

  const envTemplate = await fs.readFile(path.join(appDir, '.dev.vars'), 'utf8');
  assert.match(envTemplate, /\.\/static-output/);

  const readme = await fs.readFile(path.join(appDir, 'README.md'), 'utf8');
  assert.match(readme, /api-src\//);
  assert.match(readme, /static-output/);
  assert.doesNotMatch(readme, /src-api\//);

  const gitignore = await fs.readFile(path.join(appDir, '.gitignore'), 'utf8');
  assert.match(gitignore, /static-output/);

  t.after(async () => {
    await tmp.cleanup();
  });
});
