#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';

import { bundle } from '../src/node/bundle.js';
import { seedRemoteBuild, triggerRemoteBuild } from '../src/node/deploy.js';
import { loadLocalEnv, refreshPreviewPrivateOutputs, startPreviewServer } from '../src/node/preview.js';

function parseArgs(argv) {
  const out = {
    command: 'build',
    srcDir: null,
    outFile: null,
    publicOutDir: null,
    prettyDefault: false,
    cwd: null,
    watch: false,
    host: '127.0.0.1',
    port: 8788,
    workerOrigin: 'http://127.0.0.1:8787',
    workerPort: 8787,
    routePath: '/',
    noOpen: false,
    pollMs: 750,
  };

  if (argv[0] === 'preview' || argv[0] === 'dev' || argv[0] === 'deploy' || argv[0] === 'rebuild') {
    out.command = argv[0];
    argv = argv.slice(1);
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src' && argv[i + 1]) out.srcDir = argv[++i];
    else if (a === '--out' && argv[i + 1]) out.outFile = argv[++i];
    else if (a === '--public-out' && argv[i + 1]) out.publicOutDir = argv[++i];
    else if (a === '--cwd' && argv[i + 1]) out.cwd = argv[++i];
    else if (a === '--host' && argv[i + 1]) out.host = argv[++i];
    else if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]);
    else if (a === '--worker' && argv[i + 1]) out.workerOrigin = argv[++i];
    else if (a === '--worker-port' && argv[i + 1]) out.workerPort = Number(argv[++i]);
    else if (a === '--route' && argv[i + 1]) out.routePath = argv[++i];
    else if (a === '--poll-ms' && argv[i + 1]) out.pollMs = Number(argv[++i]);
    else if (a === '--pretty') out.prettyDefault = true;
    else if (a === '--watch') out.watch = true;
    else if (a === '--no-open') out.noOpen = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage:\n` +
          `  statikapi-cf [--src src-api] [--out dist/worker.mjs] [--public-out public] [--pretty] [--cwd DIR]\n` +
          `  statikapi-cf preview [--cwd DIR] [--host 127.0.0.1] [--port 8788] [--worker http://127.0.0.1:8787] [--no-open]\n` +
          `  statikapi-cf dev [--cwd DIR] [--src src-api] [--out dist/worker.mjs] [--public-out public] [--host 127.0.0.1] [--port 8788] [--worker-port 8787] [--poll-ms 750] [--no-open]\n` +
          `  statikapi-cf deploy [--cwd DIR] [--src src-api] [--out dist/worker.mjs] [--public-out public] [--worker https://your-app.example.com]\n` +
          `  statikapi-cf rebuild --worker https://your-app.example.com [--route /users/1] [--cwd DIR]\n` +
          `Auto-detects src from wrangler.toml [vars] STATIK_SRC and public assets directory from [assets].directory when present.`
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
      // ignore
    }
    const parent = path.dirname(dir);
    if (parent === dir) return { root: path.resolve(start), wranglerToml: null };
    dir = parent;
  }
}

function readTomlVar(toml, key) {
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

function readTomlAssetsDirectory(toml) {
  const lines = String(toml || '').split(/\r?\n/);
  let inAssets = false;
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    if (l.startsWith('[') && l.endsWith(']')) {
      inAssets = l.toLowerCase() === '[assets]';
      continue;
    }
    if (!inAssets) continue;
    const m = l.match(/^directory\s*=\s*["']([^"']+)["']/i);
    if (m) return m[1];
  }
  return null;
}

async function runBuildOnce(options) {
  await bundle(options);
  console.log(`✔ worker emitted → ${path.relative(options.cwd, options.outFile)}`);
}

function spawnWranglerProcess(args, cwd, env = process.env) {
  const child = spawn('wrangler', args, {
    cwd,
    env,
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error(err?.stack || err?.message || String(err));
  });
  return child;
}

async function runWrangler(args, cwd, env = process.env) {
  const child = spawnWranglerProcess(args, cwd, env);
  const code = await new Promise((resolve) => child.once('exit', (exitCode) => resolve(exitCode ?? 0)));
  if (code !== 0) {
    throw new Error(`wrangler ${args.join(' ')} exited with code ${code}`);
  }
}

async function collectWatchState(root, srcDir) {
  const watchRoot = path.resolve(root, srcDir);
  const state = new Map();

  async function walk(dir) {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of ents) {
      if (entry.name.startsWith('_')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || !/\.(js|mjs|cjs)$/i.test(entry.name)) continue;
      const st = await fs.stat(abs).catch(() => null);
      if (!st) continue;
      state.set(abs, `${st.size}:${Math.floor(st.mtimeMs)}`);
    }
  }

  await walk(watchRoot);

  const configFile = path.join(root, 'statikapi.config.js');
  const configStat = await fs.stat(configFile).catch(() => null);
  if (configStat) {
    state.set(configFile, `${configStat.size}:${Math.floor(configStat.mtimeMs)}`);
  }

  return state;
}

async function startPollingBuildWatcher({
  root,
  srcDir,
  outFile,
  publicOutDir,
  prettyDefault,
  useIndexJson,
  pollMs,
  onRebuild,
}) {
  let last = await collectWatchState(root, srcDir);
  let timer = null;
  let building = false;
  let queued = false;

  async function rebuild(reason) {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      console.log(`statikapi-cf dev → rebuilding (${reason})`);
      await bundle({
        cwd: root,
        srcDir,
        outFile,
        publicOutDir,
        prettyDefault,
        useIndexJson,
      });
      console.log(`✔ worker emitted → ${path.relative(root, outFile)}`);
      if (typeof onRebuild === 'function') {
        await onRebuild(reason);
      }
    } catch (err) {
      console.error(err?.stack || err?.message || String(err));
    } finally {
      building = false;
      if (queued) {
        queued = false;
        await rebuild('queued change');
      }
    }
  }

  timer = setInterval(async () => {
    try {
      const next = await collectWatchState(root, srcDir);
      if (!mapsEqual(last, next)) {
        last = next;
        await rebuild('source change');
      }
    } catch {
      // keep polling
    }
  }, pollMs);

  timer.unref?.();

  return async () => {
    if (timer) clearInterval(timer);
  };
}

function mapsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

function openInBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

async function runDev({
  root,
  srcDir,
  outFile,
  publicOutDir,
  prettyDefault,
  useIndexJson,
  host,
  port,
  workerPort,
  noOpen,
  pollMs,
  buildToken,
}) {
  await runBuildOnce({
    cwd: root,
    srcDir,
    outFile,
    publicOutDir,
    prettyDefault,
    useIndexJson,
  });

  const workerOrigin = `http://${host}:${workerPort}`;
  const preview = await startPreviewServer({
    cwd: root,
    host,
    port,
    workerOrigin,
  });
  const previewUrl = `http://${preview.host}:${preview.port}/_ui/`;
  console.log(`statikapi-cf dev → preview on ${previewUrl}`);
  if (!noOpen) {
    openInBrowser(previewUrl);
  }

  let wrangler = null;
  let shuttingDown = false;
  let restartChain = Promise.resolve();

  function spawnWrangler() {
    const child = spawnWranglerProcess(['dev', '--local', '--port', String(workerPort)], root);
    child.on('error', (err) => {
      if (shuttingDown) return;
      console.error(err?.stack || err?.message || String(err));
    });
    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      if (signal === 'SIGTERM') return;
      if (code && code !== 0) {
        console.error(`wrangler dev exited with code ${code}`);
      }
    });
    return child;
  }

  async function stopWrangler(child) {
    if (!child || child.exitCode != null || child.signalCode != null) return;
    await new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    });
  }

  function queueWranglerRestart(reason) {
    restartChain = restartChain.then(async () => {
      if (shuttingDown) return;
      if (wrangler) {
        console.log(`statikapi-cf dev → restarting worker (${reason})`);
        await stopWrangler(wrangler);
      }
      wrangler = spawnWrangler();
      if (buildToken) {
        await triggerPrivateRebuild(workerOrigin, buildToken, reason);
      }
    });
    return restartChain;
  }

  const stopWatcher = await startPollingBuildWatcher({
    root,
    srcDir,
    outFile,
    publicOutDir,
    prettyDefault,
    useIndexJson,
    pollMs,
    onRebuild: async () => {
      await queueWranglerRestart('source change');
    },
  });
  await queueWranglerRestart('initial start');

  const shutdown = async (code = 0) => {
    shuttingDown = true;
    try {
      await stopWatcher();
    } catch {
      // ignore
    }
    try {
      await preview.close();
    } catch {
      // ignore
    }
    try {
      await restartChain;
    } catch {
      // ignore
    }
    if (wrangler) {
      await stopWrangler(wrangler);
    }
    process.exit(code);
  };

  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));

  await new Promise(() => {});
}

async function triggerPrivateRebuild(workerOrigin, buildToken, reason) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const refreshed = await refreshPreviewPrivateOutputs(workerOrigin, {}, { buildToken });
      if (refreshed) {
        console.log(`statikapi-cf dev → refreshed private outputs (${reason})`);
        return;
      }
    } catch {
      // worker may still be starting up
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.warn(
    `statikapi-cf dev → private outputs were not refreshed automatically after ${reason}`
  );
}

async function runDeploy({
  root,
  srcDir,
  outFile,
  publicOutDir,
  prettyDefault,
  useIndexJson,
  workerOrigin,
  buildToken,
  env,
}) {
  await runBuildOnce({
    cwd: root,
    srcDir,
    outFile,
    publicOutDir,
    prettyDefault,
    useIndexJson,
  });

  await runWrangler(['deploy'], root, env);

  if (!workerOrigin) {
    console.log(
      'statikapi-cf deploy → public assets were rebuilt and deployed. To seed private outputs now, run `statikapi-cf rebuild --worker https://your-app.example.com` or set `STATIK_DEPLOY_ORIGIN` in `.dev.vars` before deploy.'
    );
    return;
  }

  const seeded = await seedRemoteBuild(workerOrigin, buildToken, '/');
  if (seeded.seeded) {
    console.log(`statikapi-cf deploy → seeded private outputs via ${workerOrigin}`);
    return;
  }

  if (seeded.skipped) {
    console.warn(
      `statikapi-cf deploy → skipped private output seeding: ${seeded.reason}. Set deployed Worker secrets in Cloudflare, then seed manually with \`statikapi-cf rebuild --worker ${workerOrigin}\`.`
    );
    return;
  }

  console.warn(
    `statikapi-cf deploy → deployed successfully, but private output seeding failed (${seeded.error?.status || seeded.error?.message || 'unknown error'}). Set deployed Worker secrets in Cloudflare, then seed manually with \`statikapi-cf rebuild --worker ${workerOrigin}\`.`
  );
}

async function runRemoteRebuild({ workerOrigin, buildToken, routePath = '/' }) {
  await triggerRemoteBuild(workerOrigin, buildToken, routePath);
  console.log(`statikapi-cf rebuild → triggered ${routePath} on ${workerOrigin}`);
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));

  const base = args.cwd || process.cwd();
  const { root, wranglerToml } = await findProjectRoot(base);

  const srcDir =
    args.srcDir || readTomlVar(wranglerToml, 'STATIK_SRC') || process.env.STATIK_SRC || 'src-api';
  const publicOutDir =
    args.publicOutDir ||
    readTomlAssetsDirectory(wranglerToml) ||
    process.env.STATIK_PUBLIC_OUT ||
    'public';
  const useIndexJson =
    String(
      readTomlVar(wranglerToml, 'STATIK_USE_INDEX_JSON') ||
        process.env.STATIK_USE_INDEX_JSON ||
        'false'
    ).toLowerCase() === 'true';
  const outFile = args.outFile || 'dist/worker.mjs';
  const localEnv = await loadLocalEnv(root);
  const buildToken =
    localEnv.STATIK_BUILD_TOKEN ||
    readTomlVar(wranglerToml, 'STATIK_BUILD_TOKEN') ||
    process.env.STATIK_BUILD_TOKEN ||
    '';
  const workerOrigin =
    args.workerOrigin || localEnv.STATIK_DEPLOY_ORIGIN || process.env.STATIK_DEPLOY_ORIGIN || '';
  const routePath = args.routePath || process.env.STATIK_DEPLOY_ROUTE || '/';
  const childEnv = { ...process.env, ...localEnv };

  try {
    if (args.command === 'preview') {
      const preview = await startPreviewServer({
        cwd: root,
        host: args.host,
        port: Number.isFinite(args.port) ? args.port : 8788,
        workerOrigin: args.workerOrigin,
      });
      const previewUrl = `http://${preview.host}:${preview.port}/_ui/`;
      console.log(`statikapi-cf preview → serving on ${previewUrl}`);
      if (!args.noOpen) {
        openInBrowser(previewUrl);
      }
      await new Promise(() => {});
      return;
    }

    if (args.command === 'dev') {
      await runDev({
        root,
        srcDir,
        outFile,
        publicOutDir,
        prettyDefault: args.prettyDefault,
        useIndexJson,
        host: args.host,
        port: Number.isFinite(args.port) ? args.port : 8788,
        workerPort: Number.isFinite(args.workerPort) ? args.workerPort : 8787,
        noOpen: args.noOpen,
        pollMs: Number.isFinite(args.pollMs) ? args.pollMs : 750,
        buildToken,
      });
      return;
    }

    if (args.command === 'deploy') {
      await runDeploy({
        root,
        srcDir,
        outFile,
        publicOutDir,
        prettyDefault: args.prettyDefault,
        useIndexJson,
        workerOrigin,
        buildToken,
        env: childEnv,
      });
      return;
    }

    if (args.command === 'rebuild') {
      if (!workerOrigin) {
        throw new Error('Set --worker or STATIK_DEPLOY_ORIGIN before using `statikapi-cf rebuild`');
      }
      await runRemoteRebuild({ workerOrigin, buildToken, routePath });
      return;
    }

    await runBuildOnce({
      cwd: root,
      srcDir,
      outFile,
      publicOutDir,
      prettyDefault: args.prettyDefault,
      useIndexJson,
    });
  } catch (e) {
    console.error(e?.stack || e?.message || String(e));
    process.exit(1);
  }
})();
