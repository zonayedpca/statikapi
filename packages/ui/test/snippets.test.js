import test from 'node:test';
import assert from 'node:assert/strict';

import { endpointUrl, makeSnippets } from '../src/lib/snippets.js';

test('endpointUrl keeps classic CLI routes on index.json paths', () => {
  assert.equal(
    endpointUrl('/posts', { meta: { origin: 'http://127.0.0.1:3000' } }),
    'http://127.0.0.1:3000/posts/index.json'
  );
});

test('Cloudflare snippets use extensionless public and private URLs when useIndexJson is false', () => {
  const meta = {
    origin: 'http://127.0.0.1:8787',
    mode: 'cloudflare',
    useIndexJson: false,
    privateAuthHeaderName: 'x-private-auth',
  };

  const publicSnippets = makeSnippets('/public/posts', {
    entry: { public: true },
    meta,
  });
  assert.equal(publicSnippets.url, 'http://127.0.0.1:8787/public/posts');
  assert.match(publicSnippets.curl, /http:\/\/127\.0\.0\.1:8787\/public\/posts"/);

  const privateSnippets = makeSnippets('/posts/1', {
    entry: { public: false },
    meta,
  });
  assert.equal(privateSnippets.url, 'http://127.0.0.1:8787/posts/1');
  assert.match(privateSnippets.browser, /fetch\("http:\/\/127\.0\.0\.1:8787\/posts\/1"/);
  assert.match(privateSnippets.node, /x-private-auth/);
});

test('Cloudflare snippets use index.json paths when useIndexJson is true', () => {
  const meta = {
    origin: 'http://127.0.0.1:8787/',
    mode: 'cloudflare',
    useIndexJson: true,
  };

  assert.equal(endpointUrl('/posts', { meta }), 'http://127.0.0.1:8787/posts/index.json');

  const publicSnippets = makeSnippets('/public/posts', {
    entry: { public: true },
    meta,
  });
  assert.equal(publicSnippets.url, 'http://127.0.0.1:8787/public/posts/index.json');
});
