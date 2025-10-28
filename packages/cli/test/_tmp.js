import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function makeTmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'statikapi-'));
  // Ensure .js files in this temp workspace are treated as ESM
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  return {
    cwd: dir,
    join: (...p) => path.join(dir, ...p),
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}
