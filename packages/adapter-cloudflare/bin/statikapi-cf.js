#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '../src/node/bundle.js';

function parseArgs(argv) {
  const out = { srcDir: null, outFile: null, prettyDefault: false, cwd: null, watch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src' && argv[i + 1]) out.srcDir = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--cwd' && argv[i + 1]) out.cwd = argv[++i];
    else if (a === '--pretty') out.prettyDefault = true;
    else if (a === '--watch') out.watch = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: statikapi-cf [--src src-api] [--out dist/worker.mjs] [--pretty] [--cwd DIR] [--watch]\n` +
          `Auto-detects src from wrangler.toml [vars] STATIK_SRC if present.`
      );
      process.exit(0);
    }
  }
  return out;
}

async function findProjectRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    try {
      const f = await fs.readFile(path.join(dir, 'wrangler.toml'), 'utf8');
      return { root: dir, wranglerToml: f };
    } catch {
      // ignore catch
    }
    const parent = path.dirname(dir);
    if (parent === dir) return { root: path.resolve(start), wranglerToml: null };
    dir = parent;
  }
}

function readTomlVar(toml, key) {
  // tiny parser for [vars] STATIK_SRC = "..."
  // keeps it simple and safe; not a full TOML parse
  const lines = String(toml || '').split(/\r?\n/);
  let inVars = false;
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    if (l.startsWith('[') && l.endsWith(']')) {
      inVars = l.toLowerCase() === '[vars]';
      continue;
    }
    if (!inVars) continue;
    const m = l.match(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']+)["']/);
    if (m && m[1] === key) return m[2];
  }
  return null;
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));

  const base = args.cwd || process.cwd();
  const { root, wranglerToml } = await findProjectRoot(base);

  // Resolve srcDir preference: flag > [vars]STATIK_SRC > env > default
  let srcDir =
    args.srcDir || readTomlVar(wranglerToml, 'STATIK_SRC') || process.env.STATIK_SRC || 'src-api';

  const outFile = args.outFile || 'dist/worker.mjs';

  const run = async () => {
    await bundle({
      cwd: root,
      srcDir,
      outFile,
      prettyDefault: args.prettyDefault,
      watch: args.watch,
    });
    if (!args.watch) console.log(`✔ worker emitted → ${path.relative(root, outFile)}`);
    else console.log(`⟲ watcher active — emitting → ${path.relative(root, outFile)}`);
  };

  try {
    await run();
  } catch (e) {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  }
})();
