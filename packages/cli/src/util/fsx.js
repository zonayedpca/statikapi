import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function writeFileEnsured(fileAbs, data) {
  await ensureDir(path.dirname(fileAbs));
  await fs.writeFile(fileAbs, data);
}

export async function emptyDir(dirAbs) {
  // non-destructive: create if missing, else clean
  await ensureDir(dirAbs);

  const entries = await fs.readdir(dirAbs, { withFileTypes: true });

  await Promise.all(
    entries.map(async (e) => {
      const p = path.join(dirAbs, e.name);
      if (e.isDirectory()) await fs.rm(p, { recursive: true, force: true });
      else await fs.rm(p, { force: true });
    })
  );
}
