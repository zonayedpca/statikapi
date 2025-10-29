import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';

import { makeTmp } from './_tmp.js';

const BIN = path.resolve('packages/cli/bin/statikapi.js');

test('errors on invalid paths() return', async (t) => {
  const tmp = await makeTmp();
  await fs.mkdir(tmp.join('src-api/users'), { recursive: true });
  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    `
export async function paths(){ return 123; } // bad: not an array
export default {}
`
  );
  await expectFail(/paths\(\) must return an array/);

  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    ` 
export async function paths(){ return [null]; } // bad entry
export default {}
`
  );
  await expectFail(/paths\(\) for \/users\/:id must be string\[\]/);

  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    ` 
export async function paths(){ return ['']; } // empty
export default {}
`
  );
  await expectFail(/entry for :id cannot be empty/);

  await fs.writeFile(
    tmp.join('src-api/users/[id].js'),
    ` 
export async function paths(){ return ['a/b']; } // slash
export default {}
`
  );
  await expectFail(/must not contain '\/'/);

  async function expectFail(rx) {
    await new Promise((resolve, reject) => {
      execFile(process.execPath, [BIN, 'build'], { cwd: tmp.cwd }, (err, _s, stderr) => {
        if (!err) return reject(new Error('Expected failure'));
        if (!rx.test(String(_s + stderr))) return reject(new Error('Message mismatch'));
        resolve();
      });
    });
  }

  t.after(async () => {
    await tmp.cleanup();
  });
});
