import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeTmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staticapi-'));
  return {
    cwd: dir,
    join: (...p) => path.join(dir, ...p),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
