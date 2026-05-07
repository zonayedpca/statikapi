import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { bundle } from '../src/node/bundle.js';

class MockR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    this.objects.set(key, { value: String(value), options });
  }

  async get(key) {
    const found = this.objects.get(key);
    if (!found) return null;
    return {
      async text() {
        return found.value;
      },
    };
  }
}

class MockAssetsBinding {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async fetch(input) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const filePath = path.join(this.rootDir, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    const body = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (body == null) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}

class MockKVNamespace {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }
}

async function makeProject(files) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'statikapi-cf-test-'));
  await fs.mkdir(path.join(cwd, 'src-api'), { recursive: true });
  await fs.writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2) + '\n',
    'utf8'
  );

  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(cwd, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body, 'utf8');
  }

  return cwd;
}

async function loadWorker(cwd) {
  await bundle({ cwd, srcDir: 'src-api', outFile: 'dist/worker.mjs', useIndexJson: true });
  const mod = await import(
    pathToFileURL(path.join(cwd, 'dist/worker.mjs')).href + `?t=${Date.now()}`
  );
  return mod.default;
}

function makeEnv(cwd, overrides = {}) {
  return {
    ASSETS: new MockAssetsBinding(path.join(cwd, 'public')),
    STATIK_PRIVATE_BUCKET: new MockR2Bucket(),
    STATIK_MANIFEST: new MockKVNamespace(),
    STATIK_MANIFEST_BINDING: 'STATIK_MANIFEST',
    STATIK_BUILD_TOKEN: 'build-secret',
    STATIK_PRIVATE_AUTH_HEADER_NAME: 'x-private-key',
    STATIK_PRIVATE_AUTH_HEADER_VALUE: 'let-me-in',
    STATIK_USE_INDEX_JSON: 'true',
    STATIK_WORKER_REQUEST_LIMIT: '0',
    STATIK_R2_CLASS_A_LIMIT: '0',
    STATIK_R2_CLASS_B_LIMIT: '0',
    ...overrides,
  };
}

test('worker mode builds public and private outputs, skips webhook-disabled routes, and serves private data with auth', async () => {
  const cwd = await makeProject({
    'statikapi.config.js': `export default {
  listIndex: {
    enabled: true,
    pick: ['id']
  },
  cloudflare: {
    webhook: true,
    publicByDefault: true,
  },
};`,
    'src-api/index.js': `export default { scope: 'public-root' };`,
    'src-api/posts/[id].js': `export async function paths() { return ['1']; }
export async function data({ params }) { return { id: params.id, scope: 'public-post' }; }`,
    'src-api/account/index.js': `export const config = { cloudflare: { public: false } };
export default { scope: 'private-account' };`,
    'src-api/users/[id].js': `export const config = { cloudflare: { public: false, webhook: false } };
export async function paths() { return ['1']; }
export async function data({ params }) { return { id: params.id, scope: 'private-user' }; }`,
  });

  const worker = await loadWorker(cwd);
  const env = makeEnv(cwd);

  const buildRes = await worker.fetch(
    new Request('https://example.test/', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(buildRes.status, 200);
  const buildBody = await buildRes.json();
  assert.equal(buildBody.files, 1);
  assert.equal(buildBody.publicStaticFiles, 3);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(cwd, 'public/public/posts/index.json'), 'utf8'))[0].id,
    '1'
  );

  const publicManifestRes = await worker.fetch(
    new Request('https://example.test/public/_manifest'),
    env
  );
  assert.equal(publicManifestRes.status, 200);
  const publicManifest = await publicManifestRes.json();
  assert.deepEqual(
    publicManifest.map((entry) => entry.route),
    ['/public', '/public/posts', '/public/posts/1']
  );

  const manifestDenied = await worker.fetch(new Request('https://example.test/_manifest'), env);
  assert.equal(manifestDenied.status, 403);

  const manifestRes = await worker.fetch(
    new Request('https://example.test/_manifest', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  const manifest = await manifestRes.json();
  assert.deepEqual(
    manifest.map((entry) => entry.route),
    ['/account']
  );

  const publicRes = await worker.fetch(new Request('https://example.test/public/posts/1'), env);
  assert.equal(publicRes.status, 200);
  assert.equal((await publicRes.json()).scope, 'public-post');

  const publicIndexRes = await worker.fetch(new Request('https://example.test/public/posts'), env);
  assert.equal(publicIndexRes.status, 200);
  assert.deepEqual(await publicIndexRes.json(), [{ id: '1' }]);

  const privateDenied = await worker.fetch(new Request('https://example.test/account'), env);
  assert.equal(privateDenied.status, 403);

  const privateOk = await worker.fetch(
    new Request('https://example.test/account', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  assert.equal(privateOk.status, 200);
  assert.equal((await privateOk.json()).scope, 'private-account');

  const targetedBlocked = await worker.fetch(
    new Request('https://example.test/users/1', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(targetedBlocked.status, 403);

  const targetedCollection = await worker.fetch(
    new Request('https://example.test/posts', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(targetedCollection.status, 409);
  assert.match(
    (await targetedCollection.json()).error,
    /Public routes are emitted as static assets/
  );
});

test('targeted private webhook rebuild updates stored private output', async () => {
  const cwd = await makeProject({
    'statikapi.config.js': `export default {
  cloudflare: {
    webhook: true,
    publicByDefault: true,
  },
};`,
    'src-api/account/index.js': `export const config = { cloudflare: { public: false } };
export default function data({ env }) {
  return { revision: env.STATIK_TEST_REVISION || 'one' };
};`,
  });

  const worker = await loadWorker(cwd);
  const env = makeEnv(cwd, { STATIK_TEST_REVISION: 'one' });

  const initial = await worker.fetch(
    new Request('https://example.test/account', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(initial.status, 200);

  const before = await worker.fetch(
    new Request('https://example.test/account', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  assert.deepEqual(await before.json(), { revision: 'one' });

  env.STATIK_TEST_REVISION = 'two';

  const updated = await worker.fetch(
    new Request('https://example.test/account', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).updated, true);

  const after = await worker.fetch(
    new Request('https://example.test/account', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  assert.deepEqual(await after.json(), { revision: 'two' });
});

test('public routes are public by default and worker request limit is enforced', async () => {
  const cwd = await makeProject({
    'statikapi.config.js': `export default {
  cloudflare: {
    webhook: true,
    publicByDefault: true,
  },
};`,
    'src-api/index.js': `export default { scope: 'public-root' };`,
  });

  const worker = await loadWorker(cwd);
  const env = makeEnv(cwd, { STATIK_WORKER_REQUEST_LIMIT: '4' });

  const buildRes = await worker.fetch(
    new Request('https://example.test/', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(buildRes.status, 200);

  const publicRes = await worker.fetch(new Request('https://example.test/public'), env);
  assert.equal(publicRes.status, 200);

  assert.equal(
    JSON.parse(await fs.readFile(path.join(cwd, 'public/public/index.json'), 'utf8')).scope,
    'public-root'
  );

  const publicManifestRes = await worker.fetch(
    new Request('https://example.test/public/_manifest'),
    env
  );
  assert.equal(publicManifestRes.status, 200);

  const manifestRes = await worker.fetch(
    new Request('https://example.test/_manifest', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  assert.equal(manifestRes.status, 200);

  const limitedRes = await worker.fetch(
    new Request('https://example.test/_manifest', {
      headers: { 'x-private-key': 'let-me-in' },
    }),
    env
  );
  assert.equal(limitedRes.status, 429);
});

test('rebundling picks up edited route module contents', async () => {
  const cwd = await makeProject({
    'src-api/index.js': `export default { value: 'one' };`,
  });

  await bundle({ cwd, srcDir: 'src-api', outFile: 'dist/worker.mjs', useIndexJson: true });
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(cwd, 'public/public/index.json'), 'utf8')),
    { value: 'one' }
  );
  const publicManifest = JSON.parse(
    await fs.readFile(path.join(cwd, 'public/public/_manifest/index.json'), 'utf8')
  );
  assert.equal(publicManifest.length, 1);
  assert.equal(publicManifest[0].route, '/public');
  assert.equal(publicManifest[0].srcRoute, '/');
  assert.equal(publicManifest[0].filePath, 'public/index.json');
  assert.equal(publicManifest[0].public, true);
  assert.equal(typeof publicManifest[0].hash, 'string');
  assert.equal(typeof publicManifest[0].mtime, 'number');
  assert.equal(typeof publicManifest[0].bytes, 'number');

  await fs.writeFile(path.join(cwd, 'src-api/index.js'), `export default { value: 'two' };`, 'utf8');

  await bundle({ cwd, srcDir: 'src-api', outFile: 'dist/worker.mjs', useIndexJson: true });
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(cwd, 'public/public/index.json'), 'utf8')),
    { value: 'two' }
  );
});
