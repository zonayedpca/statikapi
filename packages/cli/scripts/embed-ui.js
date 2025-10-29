#!/usr/bin/env node
/**
 * Embed the built UI into packages/cli/ui before publishing.
 * Strategy:
 * 1) Ensure packages/ui/dist exists; if not, try to build it with pnpm.
 * 2) Copy packages/ui/dist -> packages/cli/ui
 * 3) Write a tiny README so the folder isn’t mistaken for a build artifact.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..'); // packages/cli
const uiPkg = path.resolve(cliRoot, '../../ui'); // packages/ui
const uiDist = path.join(uiPkg, 'dist');
const dest = path.join(cliRoot, 'ui');

function exists(p) {
  try {
    fs.accessSync(p);

    return true;
  } catch {
    return false;
  }
}

async function rimraf(p) {
  await fsp.rm(p, { recursive: true, force: true });
}

async function copyDir(src, dst) {
  await fsp.mkdir(dst, { recursive: true });

  const entries = await fsp.readdir(src, { withFileTypes: true });

  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fsp.copyFile(s, d);
  }
}

(async () => {
  // 1) build UI if needed
  if (!exists(uiDist)) {
    try {
      // Build the UI package from the workspace root
      execSync('pnpm -w --filter @statikapi/ui build', {
        stdio: 'inherit',
        cwd: path.resolve(cliRoot, '../../'),
      });
    } catch (e) {
      console.error('[statikapi] Failed to build @statikapi/ui:', e?.message || e);

      process.exit(1);
    }
  }
  if (!exists(uiDist)) {
    console.error('[statikapi] @statikapi/ui build did not produce "dist".');

    process.exit(1);
  }

  // 2) copy into packages/cli/ui
  await rimraf(dest);
  await copyDir(uiDist, dest);

  // 3) drop a tiny readme
  const note = `This folder is generated during publish by packages/cli/scripts/embed-ui.js
and contains the prebuilt StatikAPI UI that the CLI serves at /_ui.\n`;

  await fsp.writeFile(path.join(dest, 'EMBEDDED_UI_README.txt'), note, 'utf8');

  console.log(`[statikapi] Embedded UI → ${path.relative(process.cwd(), dest)}`);
})().catch((e) => {
  console.error(e);

  process.exit(1);
});
