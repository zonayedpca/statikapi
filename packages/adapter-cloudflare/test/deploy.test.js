import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBuildRoutePath, triggerRemoteBuild } from '../src/node/deploy.js';

test('normalizeBuildRoutePath keeps root and normalizes leading slashes', () => {
  assert.equal(normalizeBuildRoutePath('/'), '/');
  assert.equal(normalizeBuildRoutePath('users/1'), '/users/1');
  assert.equal(normalizeBuildRoutePath('/users/1'), '/users/1');
});

test('triggerRemoteBuild posts to the requested route with build auth', async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), method: init.method, headers: new Headers(init.headers || {}) });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };

  try {
    const refreshed = await triggerRemoteBuild('https://api.example.com/', 'build-secret', '/users/1');
    assert.equal(refreshed, true);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.com/users/1');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer build-secret');
});
