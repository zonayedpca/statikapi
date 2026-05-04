import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const IGNORED = /^_|\/_/;
const DEFAULT_GLOBAL_CF = {
  servingMode: 'worker',
  webhook: true,
  publicByDefault: false,
};

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
    const mod = await import(pathToFileURL(configPath).href);
    const value = mod.default ?? mod.config ?? mod;
    const cloudflare = value?.cloudflare;

    return {
      servingMode:
        cloudflare?.servingMode === 'r2-public' ? 'r2-public' : DEFAULT_GLOBAL_CF.servingMode,
      webhook:
        typeof cloudflare?.webhook === 'boolean' ? cloudflare.webhook : DEFAULT_GLOBAL_CF.webhook,
      publicByDefault:
        typeof cloudflare?.publicByDefault === 'boolean'
          ? cloudflare.publicByDefault
          : DEFAULT_GLOBAL_CF.publicByDefault,
    };
  } catch {
    return { ...DEFAULT_GLOBAL_CF };
  }
}

async function loadRouteModule(fileAbs) {
  const mod = await import(pathToFileURL(fileAbs).href);
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

  const routeConfig = normalizeRouteCloudflareConfig(mod.config);
  return {
    code: out,
    routeConfig,
  };
}

function normalizeRouteCloudflareConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const cloudflare = config.cloudflare;
  if (!cloudflare || typeof cloudflare !== 'object') return {};

  const out = {};
  if (typeof cloudflare.public === 'boolean') out.public = cloudflare.public;
  if (typeof cloudflare.webhook === 'boolean') out.webhook = cloudflare.webhook;
  return out;
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
    const { code, routeConfig } = await loadRouteModule(fileAbs);

    entries.push({
      file: path.relative(cwd, fileAbs).replace(/\\/g, '/'),
      route,
      type,
      dataSrc: code.data,
      pathsSrc: code.paths || null,
      cloudflareConfig: routeConfig,
    });
  }

  const list = stableSortRoutes(entries);
  const registrySource = `
export const REGISTRY = [
${list
  .map(
    (entry) => `  {
    route: ${JSON.stringify(entry.route)},
    type: ${JSON.stringify(entry.type)},
    file: ${JSON.stringify(entry.file)},
    cloudflare: ${JSON.stringify(entry.cloudflareConfig)},
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
export const PROJECT_CLOUDFLARE = ${JSON.stringify(projectConfig)};
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

const WORKER_RUNTIME_JS = `
  import { DEFAULT_PRETTY, PROJECT_CLOUDFLARE, REGISTRY } from './entry.mjs';

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
      servingMode: PROJECT_CLOUDFLARE?.servingMode === 'r2-public' ? 'r2-public' : 'worker',
      webhook:
        typeof PROJECT_CLOUDFLARE?.webhook === 'boolean' ? PROJECT_CLOUDFLARE.webhook : true,
      publicByDefault:
        typeof PROJECT_CLOUDFLARE?.publicByDefault === 'boolean'
          ? PROJECT_CLOUDFLARE.publicByDefault
          : false,
    };
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

  async function expandAllRoutes(registry, options = {}) {
    const out = [];

    for (const entry of registry) {
      const policy = getRoutePolicy(entry);
      if (options.webhookOnly && !policy.webhook) continue;

      const patternSegs = splitRoute(entry.route);
      if (entry.type === 'static') {
        out.push({ ...entry, concreteRoute: entry.route, params: {}, policy });
        continue;
      }

      if (!entry.mod || typeof entry.mod.paths !== 'function') continue;

      const values = await entry.mod.paths();
      if (!Array.isArray(values)) throw new Error('paths() must return an array');

      for (const value of values) {
        if (entry.type === 'dynamic') {
          if (typeof value !== 'string' || !value || value.includes('/')) {
            throw new Error('paths() for ' + entry.route + ' must be string[] without "/"');
          }
        }
        if (entry.type === 'catchall') {
          if (!Array.isArray(value) || !value.length) {
            throw new Error('paths() for ' + entry.route + ' must be non-empty string[] arrays');
          }
          if (value.some((segment) => typeof segment !== 'string' || !segment)) {
            throw new Error('catch-all entries must be non-empty strings');
          }
        }

        const concrete = concreteFromPattern(patternSegs, value);
        out.push({ ...entry, concreteRoute: concrete.route, params: concrete.params, policy });
      }
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
    return useIndexJson(env) ? [base, base + '/index.json'] : [base, base + '.json'];
  }

  function privatePathsForRoute(concreteRoute, env) {
    if (concreteRoute === '/') {
      return useIndexJson(env) ? ['/', '/index.json'] : ['/', '/index'];
    }
    return useIndexJson(env) ? [concreteRoute, concreteRoute + '/index.json'] : [concreteRoute, concreteRoute + '.json'];
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

  function getPublicBucket(env) {
    const bindingName = env.STATIK_PUBLIC_BUCKET_BINDING || 'STATIK_PUBLIC_BUCKET';
    return env[bindingName];
  }

  function getPrivateBucket(env) {
    const bindingName = env.STATIK_PRIVATE_BUCKET_BINDING || 'STATIK_PRIVATE_BUCKET';
    return env[bindingName];
  }

  async function writeRouteOutput(env, concreteRoute, value, policy, pretty) {
    const body = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    const key = keyForRoute(concreteRoute, env, policy.public);
    const bucket = policy.public ? getPublicBucket(env) : getPrivateBucket(env);
    if (!bucket) {
      throw new Error(policy.public ? 'STATIK_PUBLIC_BUCKET binding missing' : 'STATIK_PRIVATE_BUCKET binding missing');
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
        route: exposedRouteFor(concreteRoute, policy.public),
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

  async function handleBuildRoute(req, env) {
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

    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const pretty = body.pretty ?? DEFAULT_PRETTY;
    const requested = url.searchParams.get('route') || body.route;

    if (!requested || typeof requested !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Missing "route" (use ?route=/path)' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const normalized = normalizeRoutePath(requested, env, requested.startsWith('/public'));
    let found = null;
    for (const entry of REGISTRY) {
      const params = matchPattern(entry.route, normalized);
      if (!params) continue;
      found = { entry, params, requested };
      break;
    }

    if (!found) {
      return new Response(JSON.stringify({ ok: false, error: 'No matching route in registry' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const policy = getRoutePolicy(found.entry);
    if (!policy.webhook) {
      return new Response(JSON.stringify({ ok: false, error: 'Webhook builds are disabled for this route' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    const value = await found.entry.mod.data({ params: found.params || {}, env });
    assertSerializable(value);

    const written = await writeRouteOutput(env, normalized, value, policy, pretty);
    if (written.error) return written.error;

    const exposedRoute = exposedRouteFor(normalized, policy.public);
    const manifest = (await readManifest(env)).filter((item) => item.route !== exposedRoute);
    manifest.push({
      route: exposedRoute,
      srcRoute: found.entry.route,
      filePath: written.key,
      bytes: written.bytes,
      mtime: Date.now(),
      hash: written.etag.replace(/"/g, ''),
      public: policy.public,
    });
    manifest.sort((a, b) => a.route.localeCompare(b.route));
    await writeManifest(env, manifest);

    const origin = url.origin;
    const purgeTargets = policy.public
      ? publicPathsForRoute(normalized, env)
      : privatePathsForRoute(normalized, env);
    for (const target of purgeTargets) {
      await purgeCacheForPath(origin, target);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        route: exposedRouteFor(normalized, policy.public),
        filePath: written.key,
        bytes: written.bytes,
        public: policy.public,
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
    const expanded = await expandAllRoutes(REGISTRY, { webhookOnly: true });
    const manifest = [];
    const url = new URL(req.url);
    const origin = url.origin;
    let writtenBytes = 0;

    for (const routeEntry of expanded) {
      const value = await routeEntry.mod.data({ params: routeEntry.params || {}, env });
      assertSerializable(value);
      const written = await writeRouteOutput(
        env,
        routeEntry.concreteRoute,
        value,
        routeEntry.policy,
        pretty
      );
      if (written.error) return written.error;

      writtenBytes += written.bytes;
      manifest.push({
        route: exposedRouteFor(routeEntry.concreteRoute, routeEntry.policy.public),
        srcRoute: routeEntry.route,
        filePath: written.key,
        bytes: written.bytes,
        mtime: Date.now(),
        hash: written.etag.replace(/"/g, ''),
        public: routeEntry.policy.public,
      });

      const purgeTargets = routeEntry.policy.public
        ? publicPathsForRoute(routeEntry.concreteRoute, env)
        : privatePathsForRoute(routeEntry.concreteRoute, env);
      for (const target of purgeTargets) {
        await purgeCacheForPath(origin, target);
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
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  async function findManifestEntryForRequest(pathname, env, isPublicRoute) {
    const manifest = await readManifest(env);
    const normalized = normalizeRoutePath(pathname, env, isPublicRoute);
    const target = exposedRouteFor(normalized, isPublicRoute);
    return manifest.find((entry) => entry.route === target) || null;
  }

  async function serveRoute(req, env, pathname, isPublicRoute) {
    const project = effectiveProjectConfig();
    if (isPublicRoute && project.servingMode === 'r2-public') {
      return new Response('Not found', { status: 404 });
    }
    if (!isPublicRoute && !requirePrivateAuth(req, env)) {
      return new Response('forbidden', { status: 403 });
    }

    const manifestEntry = await findManifestEntryForRequest(pathname, env, isPublicRoute);
    if (!manifestEntry) return new Response('Not found', { status: 404 });

    const limitError = await enforceClassBLimit(env, 1);
    if (limitError) return limitError;

    const bucket = isPublicRoute ? getPublicBucket(env) : getPrivateBucket(env);
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

      if (req.method === 'POST' && url.pathname === '/build') {
        if (url.searchParams.has('route')) return handleBuildRoute(req, env);
        return handleBuild(req, env);
      }

      if (req.method === 'GET' && url.pathname === '/manifest') {
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
