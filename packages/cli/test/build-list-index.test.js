import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { makeTmp } from './_tmp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../bin/statikapi.js');

function runBuild(cwd, args = ['build', '--pretty']) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr });
    });
  });
}

test('build emits collection index output for dynamic routes when config.listIndex is enabled', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });

  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export const config = { listIndex: true };
export async function paths(){ return ['1','2']; }
export async function data({ params }){ return { id: params.id, role: 'user' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const perItem = JSON.parse(await fs.readFile(tmp.join('api-out/users/1/index.json'), 'utf8'));
  const list = JSON.parse(await fs.readFile(tmp.join('api-out/users/index.json'), 'utf8'));

  assert.deepEqual(perItem, { id: '1', role: 'user' });
  assert.deepEqual(list, [
    { id: '1', role: 'user' },
    { id: '2', role: 'user' },
  ]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build emits picked fields only for catch-all collection index output', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/docs'), { recursive: true });

  await fs.writeFile(
    tmp.join('src-api/docs/[...slug].js'),
    `
export const config = { listIndex: { enabled: true, pick: ['slug'] } };
export async function paths(){ return [['guide'], ['api','intro']]; }
export async function data({ params }){ return { slug: params.slug.join('/'), body: 'x' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const list = JSON.parse(await fs.readFile(tmp.join('api-out/docs/index.json'), 'utf8'));
  assert.deepEqual(list, [{ slug: 'guide' }, { slug: 'api/intro' }]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build emits collection index output from statikapi.config.js global defaults', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(
    tmp.join('statikapi.config.js'),
    `
export default {
  listIndex: {
    enabled: true,
    pick: ['id']
  }
};
`
  );
  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export async function paths(){ return ['1','2']; }
export async function data({ params }){ return { id: params.id, role: 'user' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const list = JSON.parse(await fs.readFile(tmp.join('api-out/users/index.json'), 'utf8'));
  assert.deepEqual(list, [{ id: '1' }, { id: '2' }]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build lets local route config override global list index defaults', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(
    tmp.join('statikapi.config.js'),
    `
export default {
  listIndex: {
    enabled: true,
    pick: ['id']
  }
};
`
  );
  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export const config = { listIndex: true };
export async function paths(){ return ['1']; }
export async function data({ params }){ return { id: params.id, role: 'user' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const list = JSON.parse(await fs.readFile(tmp.join('api-out/users/index.json'), 'utf8'));
  assert.deepEqual(list, [{ id: '1', role: 'user' }]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build allows CLI flags to enable global collection index defaults', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/docs'), { recursive: true });
  await fs.writeFile(
    tmp.join('src-api/docs/[...slug].js'),
    `
export async function paths(){ return [['guide'], ['api','intro']]; }
export async function data({ params }){ return { slug: params.slug.join('/'), body: 'x' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd, [
    'build',
    '--pretty',
    '--listIndex',
    '--listIndexPick',
    'slug',
  ]);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const list = JSON.parse(await fs.readFile(tmp.join('api-out/docs/index.json'), 'utf8'));
  assert.deepEqual(list, [{ slug: 'guide' }, { slug: 'api/intro' }]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build lets explicit CLI list index flags override config file defaults', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(
    tmp.join('statikapi.config.js'),
    `
export default {
  listIndex: false
};
`
  );
  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export async function paths(){ return ['1']; }
export async function data({ params }){ return { id: params.id, role: 'user' }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd, [
    'build',
    '--pretty',
    '--listIndex',
    '--listIndexPick',
    'id',
  ]);
  assert.equal(code, 0, `build failed\n${stdout}\n${stderr}`);

  const list = JSON.parse(await fs.readFile(tmp.join('api-out/users/index.json'), 'utf8'));
  assert.deepEqual(list, [{ id: '1' }]);

  t.after(async () => {
    await tmp.cleanup();
  });
});

test('build fails when collection index route collides with another emitted route', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(tmp.join('src-api/users/index.js'), 'export default { static: true }\n');
  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export const config = { listIndex: true };
export async function paths(){ return ['1']; }
export async function data({ params }){ return { id: params.id }; }
`
  );

  const { code, stdout, stderr } = await runBuild(tmp.cwd);
  assert.notEqual(code, 0, 'expected build failure');
  assert.match(stdout + stderr, /Route collision for \/users/);

  t.after(async () => {
    await tmp.cleanup();
  });
});
