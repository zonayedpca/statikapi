import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  diffManifestRoutes,
  fetchManifest,
  fetchRoute,
  loadLocalEnv,
  makeUiMeta,
  pickForwardHeaders,
  refreshPreviewPrivateOutputs,
  resolveUiDist,
} from '../src/node/preview.js';

test('preview helpers load local auth env, fetch manifest/routes, and resolve UI assets', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'statikapi-cf-preview-'));
  await fs.writeFile(
    path.join(tmp, '.dev.vars'),
    'STATIK_PRIVATE_AUTH_HEADER_NAME=x-private-key\nSTATIK_PRIVATE_AUTH_HEADER_VALUE=let-me-in\n',
    'utf8'
  );

  const localEnv = await loadLocalEnv(tmp);
  assert.equal(localEnv.STATIK_PRIVATE_AUTH_HEADER_NAME, 'x-private-key');
  assert.equal(localEnv.STATIK_PRIVATE_AUTH_HEADER_VALUE, 'let-me-in');

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init.headers || {}) });

    if (url.endsWith('/public/_manifest/index.json')) {
      return new Response(JSON.stringify([{ route: '/public', hash: 'a' }]), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    if (url.endsWith('/_manifest')) {
      assert.equal(calls.at(-1).headers.get('x-private-key'), 'let-me-in');
      return new Response(JSON.stringify([{ route: '/account', hash: 'b' }]), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    if (url.endsWith('/account')) {
      assert.equal(calls.at(-1).headers.get('x-private-key'), 'let-me-in');
      return new Response(JSON.stringify({ scope: 'private' }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          etag: '"abc"',
          'cache-control': 'public, max-age=0',
        },
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const manifest = await fetchManifest(
      'http://127.0.0.1:8787',
      makeUiMeta('http://127.0.0.1:8787', { useIndexJson: true }),
      localEnv
    );
    assert.deepEqual(manifest, [
      { route: '/account', hash: 'b' },
      { route: '/public', hash: 'a' },
    ]);

    const route = await fetchRoute('http://127.0.0.1:8787', '/account', localEnv);
    assert.equal(route.status, 200);
    assert.deepEqual(JSON.parse(route.body), { scope: 'private' });

    const forwarded = pickForwardHeaders(route.headers);
    assert.equal(forwarded['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(forwarded.ETag, '"abc"');
    assert.equal(forwarded['Cache-Control'], 'public, max-age=0');
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(
    diffManifestRoutes(
      [
        { route: '/public', hash: 'a' },
        { route: '/account', hash: 'b' },
      ],
      [
        { route: '/public', hash: 'c' },
        { route: '/posts', hash: 'd' },
      ]
    ),
    ['/account', '/posts', '/public']
  );

  const uiRoot = resolveUiDist();
  const indexHtml = await fs.readFile(path.join(uiRoot, 'index.html'), 'utf8');
  assert.match(indexHtml, /<div id="root">/i);
});

test('preview metadata exposes worker origin for UI snippets', () => {
  assert.deepEqual(
    makeUiMeta('http://127.0.0.1:8787', {
      useIndexJson: true,
      privateAuthHeaderName: 'x-private-key',
    }),
    {
      origin: 'http://127.0.0.1:8787',
      mode: 'cloudflare',
      useIndexJson: true,
      privateAuthHeaderName: 'x-private-key',
      publicManifestPath: '/public/_manifest/index.json',
    }
  );
});

test('preview helper triggers local private-output build with build token', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), headers: new Headers(init.headers || {}), method: init.method });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };

  try {
    const refreshed = await refreshPreviewPrivateOutputs(
      'http://127.0.0.1:8787',
      {},
      { buildToken: 'build-secret' }
    );
    assert.equal(refreshed, true);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/_preview/build');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer build-secret');
});
