import fs from 'node:fs/promises';
import path from 'node:path';

export async function mkdirp(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function copy(src, dst) {
  const st = await fs.stat(src);
  if (st.isDirectory()) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const e of entries) {
      await copy(path.join(src, e.name), path.join(dst, e.name));
    }
  } else {
    await fs.copyFile(src, dst);
  }
}

export async function writeJson(file, mutate) {
  const raw = await fs.readFile(file, 'utf8');
  const obj = JSON.parse(raw);
  const next = mutate(obj) || obj;
  await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
}

export async function renameInFiles(root, rules) {
  const todos = [];
  async function walk(dir) {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const it of items) {
      const a = path.join(dir, it.name);
      if (it.isDirectory()) await walk(a);
      else if (it.isFile()) todos.push(a);
    }
  }
  await walk(root);
  for (const file of todos) {
    const buf = await fs.readFile(file, 'utf8');
    let out = buf;
    for (const { search, replace } of rules) {
      out = out.replace(search, replace);
    }
    if (out !== buf) await fs.writeFile(file, out, 'utf8');
  }
}
