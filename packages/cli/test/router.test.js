import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mapRoutes } from '../src/router/mapRoutes.js';

const FIX = path.resolve('packages/cli/test/router.fixture/src-api');

test('maps files to routes with stable order', async () => {
  const routes = await mapRoutes({ srcAbs: FIX });

  const paths = routes.map((r) => r.route);

  // Expect exact, deterministic order:
  // 1) statics
  // 2) dynamics
  // 3) catch-all
  assert.deepEqual(paths, [
    '/', // index.js
    '/blog/archive', // blog/archive.js
    '/users', // users/index.js
    '/blog/:slug', // blog/[slug].js
    '/users/:id', // users/[id].js
    '/files/*all', // files/[...all].js
  ]);

  // Types
  const typeByPath = Object.fromEntries(routes.map((r) => [r.route, r.type]));
  assert.equal(typeByPath['/'], 'static');
  assert.equal(typeByPath['/blog/archive'], 'static');
  assert.equal(typeByPath['/users'], 'static');
  assert.equal(typeByPath['/blog/:slug'], 'dynamic');
  assert.equal(typeByPath['/users/:id'], 'dynamic');
  assert.equal(typeByPath['/files/*all'], 'catchall');

  // Segments sanity (normalized tokens)
  const check = (p, segs) => assert.deepEqual(routes.find((r) => r.route === p).segments, segs);
  check('/', []);
  check('/users', ['users']);
  check('/blog/:slug', ['blog', ':slug']);
  check('/files/*all', ['files', '*all']);
});

test('ignores underscore files/folders and non-js extensions', async () => {
  const routes = await mapRoutes({ srcAbs: FIX });
  const paths = routes.map((r) => r.route);
  // underscore ones are not present
  assert(!paths.some((p) => p.startsWith('/_')));
});
