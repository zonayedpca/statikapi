import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const IGNORED = /^_|\/_/;
const DEFAULT_GLOBAL_CF = {
  webhook: true,
  publicByDefault: true,
};
const DEFAULT_LIST_INDEX_CONFIG = Object.freeze({
  enabled: false,
  pick: null,
});

function fileToRoute(root, fileAbs) {
  const rel = path.posix
    .join(...path.relative(root, fileAbs).split(path.sep))
    .replace(/\.(mjs|cjs|js)$/i, '');

  if (rel === 'index') return '/';

  const segs = rel
    .split('/')
    .map((segment) => {
      if (segment === 'index') return null;
      if (/^\[\.{3}.+\]$/.test(segment)) return '*' + segment.slice(4, -1);
      if (/^\[.+\]$/.test(segment)) return ':' + segment.slice(1, -1);
      return segment;
    })
    .filter(Boolean);

  return '/' + segs.join('/');
}

async function walkJs(dir) {
  const out = [];
  const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of ents) {
    if (entry.name.startsWith('_')) continue;
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkJs(nextPath)));
    else if (entry.isFile() && /\.(mjs|cjs|js)$/i.test(entry.name)) out.push(nextPath);
  }
  return out;
}

async function loadProjectConfig(cwd) {
  const configPath = path.join(cwd, 'statikapi.config.js');
  try {
    const mod = await importFresh(configPath);
    const value = mod.default ?? mod.config ?? mod;
    const cloudflare = value?.cloudflare;

    return {
      cloudflare: {
        webhook:
          typeof cloudflare?.webhook === 'boolean' ? cloudflare.webhook : DEFAULT_GLOBAL_CF.webhook,
        publicByDefault:
          typeof cloudflare?.publicByDefault === 'boolean'
            ? cloudflare.publicByDefault
            : DEFAULT_GLOBAL_CF.publicByDefault,
      },
      listIndex: normalizeListIndexValue(value?.listIndex),
    };
  } catch {
    return {
      cloudflare: { ...DEFAULT_GLOBAL_CF },
      listIndex: cloneListIndexConfig(),
    };
  }
}

async function loadRouteModule(fileAbs) {
  const mod = await importFresh(fileAbs);
  let hasData = false;
  const out = {};

  if (typeof mod.paths === 'function') {
    out.paths = mod.paths.toString();
  }

  if (typeof mod.data === 'function') {
    out.data = mod.data.toString();
    hasData = true;
  } else if (typeof mod.default === 'function') {
    out.data = mod.default.toString();
    hasData = true;
  } else if (typeof mod.default !== 'undefined') {
    const serialized = JSON.stringify(mod.default);
    out.data = `async function data(){ return ${serialized}; }`;
    hasData = true;
  }

  if (!hasData) {
    out.data = `async function data(){ return { _error: "No data() or default export" }; }`;
  }

  const routeConfig = normalizeRouteConfig(mod.config);
  return {
    code: out,
    routeConfig,
    mod,
  };
}

async function importFresh(fileAbs) {
  const body = await fs.readFile(fileAbs);
  const version = createHash('sha1').update(body).digest('hex').slice(0, 12);
  const url = pathToFileURL(fileAbs);
  url.searchParams.set('v', version);
  return import(url.href);
}

function normalizeRouteConfig(config) {
  const out = {
    cloudflare: {},
    listIndex: null,
  };
  if (!config || typeof config !== 'object' || Array.isArray(config)) return out;

  const cloudflare = config.cloudflare;
  if (cloudflare && typeof cloudflare === 'object' && !Array.isArray(cloudflare)) {
    if (typeof cloudflare.public === 'boolean') out.cloudflare.public = cloudflare.public;
    if (typeof cloudflare.webhook === 'boolean') out.cloudflare.webhook = cloudflare.webhook;
  }

  if (Object.hasOwn(config, 'listIndex')) {
    out.listIndex = normalizeListIndexValue(config.listIndex);
  }

  return out;
}

function cloneListIndexConfig(cfg = DEFAULT_LIST_INDEX_CONFIG) {
  return {
    enabled: cfg.enabled,
    pick: cfg.pick ? [...cfg.pick] : null,
  };
}

function normalizeListIndexValue(raw) {
  const base = cloneListIndexConfig();

  if (raw == null || raw === false) return base;
  if (raw === true) {
    base.enabled = true;
    return base;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('listIndex must be true, false, or an object');
  }

  const enabled = raw.enabled == null ? true : raw.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error('listIndex.enabled must be a boolean');
  }

  let pick = null;
  if (Object.hasOwn(raw, 'pick') && raw.pick != null) {
    pick = normalizePick(raw.pick, 'listIndex.pick');
  }

  return { enabled, pick };
}

function normalizePick(raw, label) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : null;

  if (!list) {
    throw new Error(`${label} must be an array of strings`);
  }

  for (const key of list) {
    if (typeof key !== 'string' || !key) {
      throw new Error(`${label} must contain non-empty strings`);
    }
  }

  return Array.from(new Set(list));
}

function routeTypeFromPattern(route) {
  if (route.includes('*')) return 'catchall';
  if (route.includes(':')) return 'dynamic';
  return 'static';
}

function stableSortRoutes(routes) {
  const rank = { static: 0, dynamic: 1, catchall: 2 };
  return routes.sort((a, b) => {
    const left = rank[a.type] ?? 3;
    const right = rank[b.type] ?? 3;
    if (left !== right) return left - right;
    return a.route.localeCompare(b.route);
  });
}

export async function bundle({
  cwd = process.cwd(),
  srcDir = 'src-api',
  outFile = 'dist/worker.mjs',
  prettyDefault = false,
  publicOutDir = 'public',
  useIndexJson = false,
  watch = false,
}) {
  const root = path.resolve(cwd, srcDir);
  const files = await walkJs(root);
  const projectConfig = await loadProjectConfig(cwd);

  const entries = [];
  for (const fileAbs of files) {
    if (IGNORED.test(fileAbs.replace(root, ''))) continue;
    const route = fileToRoute(root, fileAbs);
    const type = routeTypeFromPattern(route);
    const { code, routeConfig, mod } = await loadRouteModule(fileAbs);

    entries.push({
      file: path.relative(cwd, fileAbs).replace(/\\/g, '/'),
      route,
      type,
      dataSrc: code.data,
      pathsSrc: code.paths || null,
      cloudflareConfig: routeConfig.cloudflare,
      listIndexConfig: routeConfig.listIndex,
      runtimeModule: mod,
    });
  }

  const list = stableSortRoutes(entries);
  const publicManifest = await emitPublicAssets({
    cwd,
    entries: list,
    outDir: publicOutDir,
    projectConfig,
    useIndexJson,
  });
  const registrySource = `
export const REGISTRY = [
${list
  .map(
    (entry) => `  {
    route: ${JSON.stringify(entry.route)},
    type: ${JSON.stringify(entry.type)},
    file: ${JSON.stringify(entry.file)},
    cloudflare: ${JSON.stringify(entry.cloudflareConfig)},
    listIndex: ${JSON.stringify(entry.listIndexConfig)},
    mod: (function(){
      ${entry.pathsSrc ? `const paths = ${entry.pathsSrc};` : ''}
      const data = ${entry.dataSrc};
      return { ${entry.pathsSrc ? 'paths,' : ''} data };
    })()
  }`
  )
  .join(',\n')}
];
export const DEFAULT_PRETTY = ${prettyDefault ? 'true' : 'false'};
export const PROJECT_CLOUDFLARE = ${JSON.stringify(projectConfig.cloudflare)};
export const PROJECT_LIST_INDEX = ${JSON.stringify(projectConfig.listIndex)};
export const PUBLIC_MANIFEST = ${JSON.stringify(publicManifest)};
`;

  const tmpDir = path.join(cwd, '.statikapi-cf-tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const entryFile = path.join(tmpDir, 'entry.mjs');
  const runtimeFile = path.join(tmpDir, 'runtime.mjs');

  await fs.writeFile(entryFile, registrySource, 'utf8');
  await fs.writeFile(runtimeFile, WORKER_RUNTIME_JS, 'utf8');

  const buildOpts = {
    entryPoints: [runtimeFile],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: path.resolve(cwd, outFile),
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: '// generated by @statikapi/adapter-cf\n' },
    logLevel: 'silent',
  };

  if (watch) {
    const ctx = await esbuild.context(buildOpts);
    await ctx.watch();
    return;
  }

  await esbuild.build(buildOpts);

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
}

function outputKeyForRoute(concreteRoute, useIndexJson, isPublicRoute) {
  const prefix = isPublicRoute ? 'public/' : '';
  if (concreteRoute === '/') {
    return prefix + (useIndexJson ? 'index.json' : 'index');
  }

  const clean = concreteRoute.replace(/^\/+/, '');
  if (useIndexJson) return prefix + clean + '/index.json';
  return prefix + clean + '/index';
}

function publicDisplayKeyForRoute(concreteRoute, useIndexJson) {
  const prefix = 'public/';
  if (concreteRoute === '/') {
    return prefix + (useIndexJson ? 'index.json' : 'index');
  }

  const clean = concreteRoute.replace(/^\/+/, '');
  if (useIndexJson) return prefix + clean + '/index.json';
  return prefix + clean;
}

async function textHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

function publicManifestEntryFor(sourceRoute, concreteRoute, filePath, body) {
  return {
    route: concreteRoute === '/' ? '/public' : '/public' + concreteRoute,
    srcRoute: sourceRoute,
    filePath,
    bytes: new TextEncoder().encode(body).length,
    mtime: Date.now(),
    hash: null,
    public: true,
  };
}

async function emitPublicAssets({ cwd, entries, outDir, projectConfig, useIndexJson }) {
  const outRoot = path.resolve(cwd, outDir);
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outRoot, { recursive: true });
  const manifest = [];
  const owners = new Map();

  for (const entry of entries) {
    const policy = getNodeRoutePolicy(entry, projectConfig);
    if (!policy.public) continue;

    const outputs = await expandNodeEntry(entry, projectConfig);
    for (const output of outputs) {
      const body = JSON.stringify(output.value, null, 2) + '\n';
      const assetKey = outputKeyForRoute(output.route, useIndexJson, true);
      const displayKey = publicDisplayKeyForRoute(output.route, useIndexJson);
      const target = path.join(outRoot, assetKey);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body, 'utf8');

      const manifestEntry = publicManifestEntryFor(entry.route, output.route, displayKey, body);
      manifestEntry.hash = await textHash(body);
      const owner = owners.get(manifestEntry.route);
      if (owner && owner !== manifestEntry.srcRoute) {
        throw new Error(
          'Route collision for ' +
            manifestEntry.route +
            ': ' +
            manifestEntry.srcRoute +
            ' conflicts with ' +
            owner
        );
      }
      owners.set(manifestEntry.route, manifestEntry.srcRoute);
      manifest.push(manifestEntry);
    }
  }

  manifest.sort((a, b) => a.route.localeCompare(b.route));
  await writePublicManifestAsset(outRoot, manifest, useIndexJson);
  return manifest;
}

async function writePublicManifestAsset(outRoot, manifest, useIndexJson) {
  const body = JSON.stringify(manifest, null, 2) + '\n';
  const key = outputKeyForRoute('/_manifest', useIndexJson, true);
  const target = path.join(outRoot, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, 'utf8');
}

function getNodeRoutePolicy(entry, projectConfig) {
  const local = entry.cloudflareConfig || {};
  return {
    public:
      typeof local.public === 'boolean'
        ? local.public
        : projectConfig.cloudflare.publicByDefault !== false,
    webhook:
      typeof local.webhook === 'boolean'
        ? local.webhook
        : projectConfig.cloudflare.webhook !== false,
  };
}

function getNodeRouteListIndex(entry, projectConfig) {
  if (entry.listIndexConfig == null) {
    return cloneListIndexConfig(projectConfig.listIndex);
  }
  return cloneListIndexConfig(entry.listIndexConfig);
}

async function expandNodeEntry(entry, projectConfig) {
  const listIndex = getNodeRouteListIndex(entry, projectConfig);
  const outputs = [];

  if (entry.type === 'static') {
    outputs.push({ route: entry.route, value: await resolveNodeValue(entry.runtimeModule, {}) });
    return outputs;
  }

  if (typeof entry.runtimeModule?.paths !== 'function') return outputs;
  const values = await entry.runtimeModule.paths();
  const seen = new Set();
  const items = [];
  const patternSegs = splitPattern(entry.route);

  for (const value of values) {
    const concrete = concreteFromPatternNode(patternSegs, value);
    if (seen.has(concrete.route)) continue;
    seen.add(concrete.route);
    const item = await resolveNodeValue(entry.runtimeModule, { params: concrete.params });
    items.push(item);
    outputs.push({ route: concrete.route, value: item });
  }

  if (listIndex.enabled) {
    const collectionRoute = collectionRouteForPatternNode(entry.route);
    if (!collectionRoute) {
      throw new Error('config.listIndex requires a static parent route for ' + entry.route);
    }
    outputs.push({
      route: collectionRoute,
      value: items.map((item) => pickNodeItemFields(item, listIndex.pick, entry.route)),
    });
  }

  return outputs;
}

async function resolveNodeValue(mod, args) {
  if (typeof mod?.data === 'function') return mod.data(args);
  if (typeof mod?.default === 'function') return mod.default(args);
  return mod?.default;
}

function splitPattern(route) {
  return route === '/' ? [] : route.replace(/^\//, '').split('/');
}

function concreteFromPatternNode(patternSegs, entry) {
  const params = {};
  const segs = [];
  let dynamicIndex = 0;

  for (const segment of patternSegs) {
    if (segment.startsWith(':')) {
      const value = Array.isArray(entry) ? entry[dynamicIndex++] : entry;
      params[segment.slice(1)] = String(value);
      segs.push(String(value));
      continue;
    }
    if (segment.startsWith('*')) {
      const name = segment.slice(1);
      const value = Array.isArray(entry) ? entry.slice(dynamicIndex) : [entry];
      params[name] = value.map(String);
      segs.push(...params[name]);
      break;
    }
    segs.push(segment);
  }

  return { route: '/' + segs.join('/'), params };
}

function collectionRouteForPatternNode(route) {
  const segs = splitPattern(route);
  const last = segs[segs.length - 1];
  if (!last || (!last.startsWith(':') && !last.startsWith('*'))) return null;

  const parent = segs.slice(0, -1);
  if (parent.some((segment) => segment.startsWith(':') || segment.startsWith('*'))) return null;
  return parent.length ? '/' + parent.join('/') : '/';
}

function pickNodeItemFields(item, pick, route) {
  if (!pick) return item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('config.listIndex.pick requires plain-object items for ' + route);
  }
  const out = {};
  for (const key of pick) {
    if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key];
  }
  return out;
}

const WORKER_RUNTIME_JS = `
  import { DEFAULT_PRETTY, PROJECT_CLOUDFLARE, PROJECT_LIST_INDEX, PUBLIC_MANIFEST, REGISTRY } from './entry.mjs';

  const MANIFEST_KEY = 'manifest';
  const LIMIT_PREFIX = '__statik_limit__:';

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function assertSerializable(value, seen = new Set()) {
    const type = typeof value;
    if (value == null) return;
    if (type === 'string' || type === 'boolean') return;
    if (type === 'number') {
      if (!Number.isFinite(value)) throw new Error('Not JSON-serializable: Number must be finite');
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) assertSerializable(item, seen);
      return;
    }
    if (type === 'object') {
      if (seen.has(value)) throw new Error('Not JSON-serializable: Circular structure detected');
      if (!isPlainObject(value)) {
        throw new Error('Not JSON-serializable: Only plain objects/arrays allowed');
      }
      seen.add(value);
      for (const key of Object.keys(value)) {
        assertSerializable(value[key], seen);
      }
      seen.delete(value);
      return;
    }
    throw new Error('Not JSON-serializable: ' + type + ' is not allowed');
  }

  function splitRoute(route) {
    if (route === '/') return [];
    return route.replace(/^\\//, '').split('/');
  }

  function useIndexJson(env) {
    return String(env.STATIK_USE_INDEX_JSON || 'true').toLowerCase() === 'true';
  }

  function effectiveProjectConfig() {
    return {
      webhook:
        typeof PROJECT_CLOUDFLARE?.webhook === 'boolean' ? PROJECT_CLOUDFLARE.webhook : true,
      publicByDefault:
        typeof PROJECT_CLOUDFLARE?.publicByDefault === 'boolean'
          ? PROJECT_CLOUDFLARE.publicByDefault
          : true,
    };
  }

  function cloneListIndexConfig(cfg = PROJECT_LIST_INDEX || { enabled: false, pick: null }) {
    return {
      enabled: cfg?.enabled === true,
      pick: Array.isArray(cfg?.pick) ? [...cfg.pick] : null,
    };
  }

  function getRouteListIndex(entry) {
    if (entry.listIndex == null) return cloneListIndexConfig(PROJECT_LIST_INDEX);
    return cloneListIndexConfig(entry.listIndex);
  }

  function getRoutePolicy(entry) {
    const globalConfig = effectiveProjectConfig();
    const local = entry.cloudflare || {};
    return {
      public: typeof local.public === 'boolean' ? local.public : globalConfig.publicByDefault,
      webhook: typeof local.webhook === 'boolean' ? local.webhook : globalConfig.webhook,
    };
  }

  function getManifestNS(env) {
    const bindingName = env.STATIK_MANIFEST_BINDING || 'STATIK_MANIFEST';
    const ns = env[bindingName];
    if (!ns) {
      throw new Error('KV namespace binding "' + bindingName + '" not found on env');
    }
    return ns;
  }

  async function readManifest(env) {
    const ns = getManifestNS(env);
    const raw = await ns.get(MANIFEST_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async function writeManifest(env, list) {
    const ns = getManifestNS(env);
    await ns.put(MANIFEST_KEY, JSON.stringify(list));
  }

  async function readCounter(env, key) {
    const ns = getManifestNS(env);
    const raw = await ns.get(LIMIT_PREFIX + key);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async function writeCounter(env, key, value) {
    const ns = getManifestNS(env);
    await ns.put(LIMIT_PREFIX + key, String(value));
  }

  function readLimit(env, key) {
    const raw = Number(env[key] || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.floor(raw);
  }

  async function enforceLimit(env, counterKey, limitEnvKey, amount) {
    const limit = readLimit(env, limitEnvKey);
    if (!limit) return null;
    const current = await readCounter(env, counterKey);
    if (current + amount > limit) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Usage limit exceeded',
          counter: counterKey,
          limit,
          current,
          requested: amount,
        }),
        {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }
      );
    }
    await writeCounter(env, counterKey, current + amount);
    return null;
  }

  async function enforceWorkerRequestLimit(env) {
    return enforceLimit(env, 'worker_requests', 'STATIK_WORKER_REQUEST_LIMIT', 1);
  }

  async function enforceClassALimit(env, amount) {
    return enforceLimit(env, 'r2_class_a', 'STATIK_R2_CLASS_A_LIMIT', amount);
  }

  async function enforceClassBLimit(env, amount) {
    return enforceLimit(env, 'r2_class_b', 'STATIK_R2_CLASS_B_LIMIT', amount);
  }

  function matchPattern(patternRoute, concreteRoute) {
    const patternSegs = splitRoute(patternRoute);
    const concreteSegs = splitRoute(concreteRoute);
    const params = {};
    let i = 0;
    let j = 0;

    while (i < patternSegs.length && j < concreteSegs.length) {
      const pattern = patternSegs[i];
      const concrete = concreteSegs[j];

      if (pattern.startsWith(':')) {
        params[pattern.slice(1)] = decodeURIComponent(concrete);
        i++;
        j++;
        continue;
      }
      if (pattern.startsWith('*')) {
        params[pattern.slice(1)] = concreteSegs.slice(j).map((segment) => decodeURIComponent(segment));
        i = patternSegs.length;
        j = concreteSegs.length;
        break;
      }
      if (pattern !== concrete) return null;
      i++;
      j++;
    }

    if (i !== patternSegs.length || j !== concreteSegs.length) return null;
    return params;
  }

  function concreteFromPattern(patternSegs, entry) {
    const params = {};
    const segs = [];
    let dynamicIndex = 0;

    for (const segment of patternSegs) {
      if (segment.startsWith(':')) {
        const value = Array.isArray(entry) ? entry[dynamicIndex++] : entry;
        params[segment.slice(1)] = String(value);
        segs.push(String(value));
        continue;
      }
      if (segment.startsWith('*')) {
        const name = segment.slice(1);
        const value = Array.isArray(entry) ? entry.slice(dynamicIndex) : [entry];
        params[name] = value.map(String);
        segs.push(...params[name]);
        break;
      }
      segs.push(segment);
    }

    return {
      route: '/' + segs.join('/'),
      params,
    };
  }

  function collectionRouteForPattern(route) {
    const segs = splitRoute(route);
    const last = segs[segs.length - 1];
    if (!last || (!last.startsWith(':') && !last.startsWith('*'))) return null;

    const parent = segs.slice(0, -1);
    if (parent.some((segment) => segment.startsWith(':') || segment.startsWith('*'))) return null;
    return parent.length ? '/' + parent.join('/') : '/';
  }

  function pickItemFields(item, pick, route) {
    if (!pick) return item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('config.listIndex.pick requires plain-object items for ' + route);
    }

    const out = {};
    for (const key of pick) {
      if (Object.prototype.hasOwnProperty.call(item, key)) out[key] = item[key];
    }
    return out;
  }

  async function expandSourceEntry(entry, options = {}) {
    const policy = getRoutePolicy(entry);
    if (options.webhookOnly && !policy.webhook) return null;

    const listIndex = getRouteListIndex(entry);
    const outputs = [];
    const patternSegs = splitRoute(entry.route);

    if (entry.type === 'static') {
      outputs.push({ concreteRoute: entry.route, params: {} });
      return { ...entry, policy, listIndex, outputs, collectionRoute: null };
    }

    if (!entry.mod || typeof entry.mod.paths !== 'function') {
      return { ...entry, policy, listIndex, outputs, collectionRoute: null };
    }

    const values = await entry.mod.paths();
    if (!Array.isArray(values)) throw new Error('paths() must return an array');

    const seen = new Set();
    for (const value of values) {
      if (entry.type === 'dynamic') {
        if (typeof value !== 'string' || !value || value.includes('/')) {
          throw new Error('paths() for ' + entry.route + ' must be string[] without "/"');
        }
      }
      if (entry.type === 'catchall') {
        const segments = typeof value === 'string' ? [value] : value;
        if (!Array.isArray(segments) || !segments.length) {
          throw new Error('paths() for ' + entry.route + ' must be non-empty string[] arrays');
        }
        if (segments.some((segment) => typeof segment !== 'string' || !segment || segment.includes('/'))) {
          throw new Error('catch-all entries must be non-empty strings without "/"');
        }
      }

      const concrete = concreteFromPattern(patternSegs, value);
      if (seen.has(concrete.route)) continue;
      seen.add(concrete.route);
      outputs.push({ concreteRoute: concrete.route, params: concrete.params });
    }

    let collectionRoute = null;
    if (listIndex.enabled) {
      collectionRoute = collectionRouteForPattern(entry.route);
      if (!collectionRoute) {
        throw new Error('config.listIndex requires a static parent route for ' + entry.route);
      }
    }

    return { ...entry, policy, listIndex, outputs, collectionRoute };
  }

  async function expandAllRoutes(registry, options = {}) {
    const out = [];
    for (const entry of registry) {
      const expanded = await expandSourceEntry(entry, options);
      if (!expanded) continue;
      out.push(expanded);
    }
    return out;
  }

  async function digestETag(text) {
    const encoded = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    const hex = [...new Uint8Array(hash)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return '"' + hex + '"';
  }

  function stripPublicPrefix(pathname) {
    if (pathname === '/public' || pathname === '/public/') return '/';
    if (pathname.startsWith('/public/')) return pathname.slice('/public'.length);
    return pathname;
  }

  function normalizeRoutePath(pathname, env, isPublicRoute) {
    let normalized = pathname;
    if (isPublicRoute) normalized = stripPublicPrefix(normalized);

    if (normalized === '') normalized = '/';
    if (normalized !== '/' && normalized.endsWith('/')) normalized = normalized.slice(0, -1);

    if (useIndexJson(env)) {
      if (normalized === '/index.json') return '/';
      normalized = normalized.replace(/\\/index\\.json$/, '');
      if (!normalized) return '/';
    } else {
      if (normalized === '/index') return '/';
      normalized = normalized.replace(/\\/index$/, '');
      if (!normalized) return '/';
    }

    normalized = normalized.replace(/\\.json$/, '');
    return normalized || '/';
  }

  function exposedRouteFor(concreteRoute, isPublicRoute) {
    if (!isPublicRoute) return concreteRoute;
    if (concreteRoute === '/') return '/public';
    return '/public' + concreteRoute;
  }

  function keyForRoute(concreteRoute, env, isPublicRoute) {
    const prefix = isPublicRoute ? 'public/' : '';
    if (concreteRoute === '/') {
      return prefix + (useIndexJson(env) ? 'index.json' : 'index');
    }

    const clean = concreteRoute.replace(/^\\/+/, '');
    if (useIndexJson(env)) return prefix + clean + '/index.json';
    return prefix + clean;
  }

  function publicPathsForRoute(concreteRoute, env) {
    const base = exposedRouteFor(concreteRoute, true);
    if (base === '/public') {
      return useIndexJson(env) ? ['/public', '/public/index.json'] : ['/public', '/public/index'];
    }
    return useIndexJson(env) ? [base, base + '/index.json'] : [base, base + '/index'];
  }

  function privatePathsForRoute(concreteRoute, env) {
    if (concreteRoute === '/') {
      return useIndexJson(env) ? ['/', '/index.json'] : ['/', '/index'];
    }
    return useIndexJson(env)
      ? [concreteRoute, concreteRoute + '/index.json']
      : [concreteRoute];
  }

  async function purgeCacheForPath(origin, pathname) {
    try {
      await caches.default.delete(new Request(origin + pathname, { method: 'GET' }));
    } catch {
      // best-effort only
    }
  }

  function requireBuildAuth(req, env) {
    const auth = req.headers.get('authorization') || '';
    const expected = 'Bearer ' + (env.STATIK_BUILD_TOKEN || '');
    return Boolean(env.STATIK_BUILD_TOKEN) && auth === expected;
  }

  function requirePrivateAuth(req, env) {
    const name = env.STATIK_PRIVATE_AUTH_HEADER_NAME;
    const value = env.STATIK_PRIVATE_AUTH_HEADER_VALUE;
    if (!name || !value) return false;
    return req.headers.get(name) === value;
  }

  function getPrivateBucket(env) {
    const bindingName = env.STATIK_PRIVATE_BUCKET_BINDING || 'STATIK_PRIVATE_BUCKET';
    return env[bindingName];
  }

  function getAssetsBinding(env) {
    return env.ASSETS || null;
  }

  function assetRequestPathForRoute(pathname, env) {
    const normalized = normalizeRoutePath(pathname, env, true);
    if (normalized === '/') {
      return useIndexJson(env) ? '/public/index.json' : '/public/index';
    }
    return useIndexJson(env) ? '/public' + normalized + '/index.json' : '/public' + normalized + '/index';
  }

  function publicManifestAssetPath(env) {
    return useIndexJson(env) ? '/public/_manifest/index.json' : '/public/_manifest/index';
  }

  function isPublicManifestPath(pathname) {
    return (
      pathname === '/public/_manifest' ||
      pathname === '/public/_manifest/' ||
      pathname === '/public/_manifest.json' ||
      pathname === '/public/_manifest/index.json'
    );
  }

  async function writeRouteOutput(env, concreteRoute, value, policy, pretty) {
    const body = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    const key = keyForRoute(concreteRoute, env, false);
    const bucket = getPrivateBucket(env);
    if (!bucket) {
      throw new Error('STATIK_PRIVATE_BUCKET binding missing');
    }

    const limitError = await enforceClassALimit(env, 1);
    if (limitError) return { error: limitError };

    const etag = await digestETag(body);
    await bucket.put(key, body, {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'public, max-age=0, s-maxage=31536000',
      },
      customMetadata: {
        route: exposedRouteFor(concreteRoute, false),
        etag,
      },
    });

    return {
      text: body,
      key,
      etag,
      bytes: new TextEncoder().encode(body).length,
    };
  }

  function manifestEntryFor(sourceRoute, concreteRoute, policy, written) {
    return {
      route: exposedRouteFor(concreteRoute, policy.public),
      srcRoute: sourceRoute,
      filePath: written.key,
      bytes: written.bytes,
      mtime: Date.now(),
      hash: written.etag.replace(/"/g, ''),
      public: policy.public,
    };
  }

  function addManifestEntry(manifest, entry, owners) {
    const owner = owners.get(entry.route);
    if (owner && owner !== entry.srcRoute) {
      throw new Error('Route collision for ' + entry.route + ': ' + entry.srcRoute + ' conflicts with ' + owner);
    }
    owners.set(entry.route, entry.srcRoute);
    manifest.push(entry);
  }

  function buildOwnersMap(manifest) {
    const owners = new Map();
    for (const entry of manifest) {
      owners.set(entry.route, entry.srcRoute || entry.route);
    }
    return owners;
  }

  async function buildSourceOutputs(sourceEntry, env, pretty) {
    const manifestEntries = [];
    const purgeTargets = [];
    let writtenBytes = 0;
    const items = [];

    if (sourceEntry.policy.public) {
      for (const output of sourceEntry.outputs) {
        const value = await sourceEntry.mod.data({ params: output.params || {}, env });
        assertSerializable(value);
        items.push(value);
      }

      return {
        manifestEntries: [],
        purgeTargets: [],
        writtenBytes: 0,
      };
    }

    for (const output of sourceEntry.outputs) {
      const value = await sourceEntry.mod.data({ params: output.params || {}, env });
      assertSerializable(value);
      items.push(value);

      const written = await writeRouteOutput(env, output.concreteRoute, value, sourceEntry.policy, pretty);
      if (written.error) return { error: written.error };

      writtenBytes += written.bytes;
      manifestEntries.push(
        manifestEntryFor(sourceEntry.route, output.concreteRoute, sourceEntry.policy, written)
      );

      const paths = sourceEntry.policy.public
        ? publicPathsForRoute(output.concreteRoute, env)
        : privatePathsForRoute(output.concreteRoute, env);
      purgeTargets.push(...paths);
    }

    if (sourceEntry.collectionRoute) {
      const payload = items.map((item) =>
        pickItemFields(item, sourceEntry.listIndex.pick, sourceEntry.route)
      );
      const written = await writeRouteOutput(
        env,
        sourceEntry.collectionRoute,
        payload,
        sourceEntry.policy,
        pretty
      );
      if (written.error) return { error: written.error };

      writtenBytes += written.bytes;
      manifestEntries.push(
        manifestEntryFor(sourceEntry.route, sourceEntry.collectionRoute, sourceEntry.policy, written)
      );

      const paths = sourceEntry.policy.public
        ? publicPathsForRoute(sourceEntry.collectionRoute, env)
        : privatePathsForRoute(sourceEntry.collectionRoute, env);
      purgeTargets.push(...paths);
    }

    return { manifestEntries, purgeTargets, writtenBytes };
  }

  async function findSourceEntryForRequestedRoute(requested, env) {
    const normalized = normalizeRoutePath(requested, env, false);

    for (const entry of REGISTRY) {
      const params = matchPattern(entry.route, normalized);
      if (params) {
        return entry;
      }

      const listIndex = getRouteListIndex(entry);
      if (!listIndex.enabled) continue;

      const collectionRoute = collectionRouteForPattern(entry.route);
      if (!collectionRoute) continue;
      if (collectionRoute === normalized) {
        return entry;
      }
    }

    return null;
  }

  async function handleBuildRoute(req, env, requested) {
    if (!requireBuildAuth(req, env)) {
      return new Response('unauthorized', { status: 401 });
    }

    const project = effectiveProjectConfig();
    if (!project.webhook) {
      return new Response(JSON.stringify({ ok: false, error: 'Webhook builds are disabled globally' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const pretty = body.pretty ?? DEFAULT_PRETTY;

    const found = await findSourceEntryForRequestedRoute(requested, env);
    if (!found) {
      return new Response(JSON.stringify({ ok: false, error: 'No matching route in registry' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const policy = getRoutePolicy(found);
    if (!policy.webhook) {
      return new Response(JSON.stringify({ ok: false, error: 'Webhook builds are disabled for this route' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (policy.public) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Public routes are emitted as static assets. Re-run statikapi-cf build and deploy.',
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const expanded = await expandSourceEntry(found, { webhookOnly: true });
    const built = await buildSourceOutputs(expanded, env, pretty);
    if (built.error) return built.error;

    const existing = (await readManifest(env)).filter((item) => item.srcRoute !== found.route);
    const owners = buildOwnersMap(existing);
    for (const entry of built.manifestEntries) {
      addManifestEntry(existing, entry, owners);
    }
    existing.sort((a, b) => a.route.localeCompare(b.route));
    await writeManifest(env, existing);

    const url = new URL(req.url);
    for (const target of built.purgeTargets) {
      await purgeCacheForPath(url.origin, target);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sourceRoute: found.route,
        files: built.manifestEntries.length,
        bytes: built.writtenBytes,
        routes: built.manifestEntries.map((entry) => entry.route).sort(),
        updated: true,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  async function handleBuild(req, env) {
    if (!requireBuildAuth(req, env)) {
      return new Response('unauthorized', { status: 401 });
    }

    const project = effectiveProjectConfig();
    if (!project.webhook) {
      return new Response(JSON.stringify({ ok: false, error: 'Webhook builds are disabled globally' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const pretty = body.pretty ?? DEFAULT_PRETTY;
    const manifest = [];
    const expanded = await expandAllRoutes(REGISTRY, { webhookOnly: true });
    const owners = new Map();
    let writtenBytes = 0;

    for (const sourceEntry of expanded) {
      const built = await buildSourceOutputs(sourceEntry, env, pretty);
      if (built.error) return built.error;

      writtenBytes += built.writtenBytes;
      for (const entry of built.manifestEntries) {
        addManifestEntry(manifest, entry, owners);
      }
      for (const target of built.purgeTargets) {
        await purgeCacheForPath(new URL(req.url).origin, target);
      }
    }

    manifest.sort((a, b) => a.route.localeCompare(b.route));
    await writeManifest(env, manifest);

    return new Response(
      JSON.stringify({
        ok: true,
        files: manifest.length,
        bytes: writtenBytes,
        skipped: 0,
        publicStaticFiles: PUBLIC_MANIFEST.length,
        updated: true,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  function isLoopbackRequest(req) {
    try {
      const { hostname } = new URL(req.url);
      return (
        hostname === '127.0.0.1' ||
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname === '[::1]'
      );
    } catch {
      return false;
    }
  }

  async function handlePreviewBuild(req, env) {
    if (!isLoopbackRequest(req)) {
      return new Response('Not found', { status: 404 });
    }

    if (!requireBuildAuth(req, env)) {
      return new Response('unauthorized', { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const pretty = body.pretty ?? DEFAULT_PRETTY;
    const manifest = [];
    const expanded = await expandAllRoutes(REGISTRY);
    const owners = new Map();
    let writtenBytes = 0;

    for (const sourceEntry of expanded) {
      const built = await buildSourceOutputs(sourceEntry, env, pretty);
      if (built.error) return built.error;

      writtenBytes += built.writtenBytes;
      for (const entry of built.manifestEntries) {
        addManifestEntry(manifest, entry, owners);
      }
      for (const target of built.purgeTargets) {
        await purgeCacheForPath(new URL(req.url).origin, target);
      }
    }

    manifest.sort((a, b) => a.route.localeCompare(b.route));
    await writeManifest(env, manifest);

    return new Response(
      JSON.stringify({
        ok: true,
        files: manifest.length,
        bytes: writtenBytes,
        preview: true,
        updated: true,
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  async function findManifestEntryForRequest(pathname, env, isPublicRoute) {
    const manifest = isPublicRoute ? PUBLIC_MANIFEST : await readManifest(env);
    const normalized = normalizeRoutePath(pathname, env, isPublicRoute);
    const target = exposedRouteFor(normalized, isPublicRoute);
    return manifest.find((entry) => entry.route === target) || null;
  }

  async function serveRoute(req, env, pathname, isPublicRoute) {
    if (isPublicRoute) {
      if (isPublicManifestPath(pathname)) {
        const assets = getAssetsBinding(env);
        if (!assets || typeof assets.fetch !== 'function') {
          return new Response('assets binding missing', { status: 500 });
        }
        return assets.fetch(new Request(new URL(publicManifestAssetPath(env), req.url), req));
      }

      const manifestEntry = await findManifestEntryForRequest(pathname, env, true);
      if (!manifestEntry) return new Response('Not found', { status: 404 });

      const assets = getAssetsBinding(env);
      if (!assets || typeof assets.fetch !== 'function') {
        return new Response('assets binding missing', { status: 500 });
      }

      const assetPath = assetRequestPathForRoute(pathname, env);
      return assets.fetch(new Request(new URL(assetPath, req.url), req));
    }

    if (!isPublicRoute && !requirePrivateAuth(req, env)) {
      return new Response('forbidden', { status: 403 });
    }

    const manifestEntry = await findManifestEntryForRequest(pathname, env, isPublicRoute);
    if (!manifestEntry) return new Response('Not found', { status: 404 });

    const limitError = await enforceClassBLimit(env, 1);
    if (limitError) return limitError;

    const bucket = getPrivateBucket(env);
    if (!bucket) return new Response('storage binding missing', { status: 500 });
    const object = await bucket.get(manifestEntry.filePath);
    if (!object) return new Response('Not found', { status: 404 });

    const text = typeof object.text === 'function' ? await object.text() : String(object.body || '');
    return new Response(text, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=0, s-maxage=31536000',
      },
    });
  }

  export default {
    async fetch(req, env) {
      const requestLimitError = await enforceWorkerRequestLimit(env);
      if (requestLimitError) return requestLimitError;

      const url = new URL(req.url);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

      if (req.method === 'POST') {
        if (url.pathname === '/_preview/build') return handlePreviewBuild(req, env);
        if (url.pathname === '/') return handleBuild(req, env);
        return handleBuildRoute(req, env, url.pathname);
      }

      if (req.method === 'GET' && url.pathname === '/_manifest') {
        if (!requirePrivateAuth(req, env)) {
          return new Response('forbidden', { status: 403 });
        }
        const list = await readManifest(env);
        return new Response(JSON.stringify(list), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (req.method === 'GET' && (url.pathname === '/public' || url.pathname.startsWith('/public/'))) {
        return serveRoute(req, env, url.pathname, true);
      }

      if (req.method === 'GET') {
        return serveRoute(req, env, url.pathname, false);
      }

      return new Response('Not found', { status: 404 });
    },
  };
`;
