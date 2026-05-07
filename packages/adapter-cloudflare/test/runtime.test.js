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
  await bundle({ cwd, srcDir: 'src-api', outFile: 'dist/worker.mjs' });
  const mod = await import(pathToFileURL(path.join(cwd, 'dist/worker.mjs')).href + `?t=${Date.now()}`);
  return mod.default;
}

function makeEnv(overrides = {}) {
  return {
    STATIK_PUBLIC_BUCKET: new MockR2Bucket(),
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
    servingMode: 'worker',
    webhook: true,
    publicByDefault: false,
  },
};`,
    'src-api/index.js': `export const config = { cloudflare: { public: true } };
export default { scope: 'public-root' };`,
    'src-api/posts/[id].js': `export const config = { cloudflare: { public: true } };
export async function paths() { return ['1']; }
export async function data({ params }) { return { id: params.id, scope: 'public-post' }; }`,
    'src-api/account/index.js': `export default { scope: 'private-account' };`,
    'src-api/users/[id].js': `export const config = { cloudflare: { webhook: false } };
export async function paths() { return ['1']; }
export async function data({ params }) { return { id: params.id, scope: 'private-user' }; }`,
  });

  const worker = await loadWorker(cwd);
  const env = makeEnv();

  const buildRes = await worker.fetch(
    new Request('https://example.test/build', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(buildRes.status, 200);
  const buildBody = await buildRes.json();
  assert.equal(buildBody.files, 4);

  const manifestRes = await worker.fetch(new Request('https://example.test/manifest'), env);
  const manifest = await manifestRes.json();
  assert.deepEqual(
    manifest.map((entry) => entry.route),
    ['/account', '/public', '/public/posts', '/public/posts/1']
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
    new Request('https://example.test/build?route=/users/1', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(targetedBlocked.status, 403);

  const targetedCollection = await worker.fetch(
    new Request('https://example.test/build?route=/public/posts', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(targetedCollection.status, 200);
  const targetedCollectionBody = await targetedCollection.json();
  assert.equal(targetedCollectionBody.files, 2);
  assert.deepEqual(targetedCollectionBody.routes, ['/public/posts', '/public/posts/1']);
});

test('r2-public mode hides /public worker reads and enforces worker request limit', async () => {
  const cwd = await makeProject({
    'statikapi.config.js': `export default {
  cloudflare: {
    servingMode: 'r2-public',
    webhook: true,
    publicByDefault: false,
  },
};`,
    'src-api/index.js': `export const config = { cloudflare: { public: true } };
export default { scope: 'public-root' };`,
  });

  const worker = await loadWorker(cwd);
  const env = makeEnv({ STATIK_WORKER_REQUEST_LIMIT: '3' });

  const buildRes = await worker.fetch(
    new Request('https://example.test/build', {
      method: 'POST',
      headers: { authorization: 'Bearer build-secret' },
      body: JSON.stringify({}),
    }),
    env
  );
  assert.equal(buildRes.status, 200);

  const publicRes = await worker.fetch(new Request('https://example.test/public'), env);
  assert.equal(publicRes.status, 404);

  assert.ok(env.STATIK_PUBLIC_BUCKET.objects.has('public/index.json'));

  const manifestRes = await worker.fetch(new Request('https://example.test/manifest'), env);
  assert.equal(manifestRes.status, 200);

  const limitedRes = await worker.fetch(new Request('https://example.test/manifest'), env);
  assert.equal(limitedRes.status, 429);
});
