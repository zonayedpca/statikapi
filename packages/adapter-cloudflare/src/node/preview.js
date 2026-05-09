import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startPreviewServer({
  cwd = process.cwd(),
  host = '127.0.0.1',
  port = 8788,
  workerOrigin = 'http://127.0.0.1:8787',
  pollMs = 1000,
} = {}) {
  const uiRoot = resolveUiDist();
  const localEnv = await loadLocalEnv(cwd);
  const buildToken = await readBuildToken(cwd, localEnv);
  const uiMeta = await loadUiMeta(cwd, workerOrigin, localEnv);
  const sseClients = new Set();
  let lastManifest = null;
  let pollTimer = null;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      const pathname = url.pathname;

      if (pathname === '/_ui/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('\n');
        const client = { id: Date.now() + Math.random(), res };
        sseClients.add(client);
        req.on('close', () => sseClients.delete(client));
        return;
      }

      if (pathname === '/ui/index' && req.method === 'GET') {
        await refreshPreviewPrivateOutputs(workerOrigin, localEnv, { buildToken }).catch(() => {});
        const manifest = await fetchManifest(workerOrigin, uiMeta, localEnv);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(manifest));
        return;
      }

      if (pathname === '/ui/meta' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(uiMeta));
        return;
      }

      if (pathname === '/_ui/file' && req.method === 'GET') {
        const route = url.searchParams.get('route') || '';
        if (!route.startsWith('/')) {
          res.statusCode = 400;
          res.end('Missing or invalid route');
          return;
        }

        const filePath = url.searchParams.get('filePath') || '';
        const isPublic = url.searchParams.get('public') === '1';
        const upstream = await fetchRoute(workerOrigin, route, localEnv, { filePath, isPublic });
        res.writeHead(upstream.status, pickForwardHeaders(upstream.headers));
        res.end(upstream.body);
        return;
      }

      if (pathname === '/') {
        res.writeHead(302, { Location: '/_ui/' });
        res.end();
        return;
      }

      if (pathname.startsWith('/_ui/')) {
        const rel = pathname.replace(/^\/_ui\//, '') || 'index.html';
        const file = path.join(uiRoot, rel);
        if (!file.startsWith(uiRoot)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        try {
          const stat = await fs.stat(file);
          if (stat.isDirectory()) {
            streamFile(path.join(file, 'index.html'), res);
          } else {
            streamFile(file, res);
          }
        } catch {
          streamFile(path.join(uiRoot, 'index.html'), res);
        }
        return;
      }

      res.statusCode = 404;
      res.end('Not Found');
    } catch (err) {
      res.statusCode = 500;
      res.end(err?.message || 'Internal Server Error');
    }
  });

  pollTimer = setInterval(async () => {
    try {
      const next = await fetchManifest(workerOrigin, uiMeta, localEnv);
      if (!lastManifest) {
        lastManifest = next;
        return;
      }

      const changedRoutes = diffManifestRoutes(lastManifest, next);
      lastManifest = next;
      if (!changedRoutes.length) return;

      for (const route of changedRoutes) {
        const line = `data: changed:${route}\n\n`;
        for (const client of sseClients) {
          try {
            client.res.write(line);
          } catch {
            // ignore disconnected clients
          }
        }
      }
    } catch {
      // worker may not be ready yet; keep retrying
    }
  }, pollMs);

  pollTimer.unref?.();

  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;

  return {
    host,
    port: actualPort,
    close: async () => {
      if (pollTimer) clearInterval(pollTimer);
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function fetchManifest(
  workerOrigin,
  uiMeta = makeUiMeta(workerOrigin),
  localEnv = {}
) {
  const [publicList, privateList] = await Promise.all([
    fetchManifestList(workerOrigin, uiMeta.publicManifestPath, 'public manifest'),
    fetchManifestList(workerOrigin, '/_manifest', 'private manifest', {
      headers: privateAuthHeaders(localEnv),
    }),
  ]);
  const combined = [...publicList, ...privateList];
  combined.sort((a, b) => String(a.route || '').localeCompare(String(b.route || '')));
  return combined;
}

async function fetchManifestList(workerOrigin, pathname, label, init = {}) {
  const res = await fetch(new URL(pathname, workerOrigin), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${label} failed: ${res.status}`);
  }

  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

export function makeUiMeta(workerOrigin, options = {}) {
  return {
    origin: workerOrigin,
    mode: 'cloudflare',
    useIndexJson: options.useIndexJson === true,
    privateAuthHeaderName: options.privateAuthHeaderName || '',
    publicManifestPath:
      options.publicManifestPath || publicManifestPathFor(options.useIndexJson === true),
  };
}

export async function fetchRoute(workerOrigin, route, localEnv, options = {}) {
  const headers = privateAuthHeaders(localEnv);
  const isPublic = options.isPublic === true || route === '/public' || route.startsWith('/public/');
  if (isPublic) headers.delete(privateAuthHeaderName(localEnv) || '');

  const target = isPublic && options.filePath ? '/' + options.filePath.replace(/^\/+/, '') : route;
  const res = await fetch(new URL(target, workerOrigin), {
    headers,
    cache: 'no-store',
  });

  return {
    status: res.status,
    headers: res.headers,
    body: await res.text(),
  };
}

export async function refreshPreviewPrivateOutputs(workerOrigin, localEnv = {}, options = {}) {
  const buildToken = options.buildToken || localEnv.STATIK_BUILD_TOKEN || process.env.STATIK_BUILD_TOKEN;
  if (!buildToken) return false;

  const res = await fetch(new URL('/_preview/build', workerOrigin), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${buildToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`preview private build failed: ${res.status}`);
  }

  return true;
}

function privateAuthHeaderName(localEnv) {
  return localEnv.STATIK_PRIVATE_AUTH_HEADER_NAME || process.env.STATIK_PRIVATE_AUTH_HEADER_NAME;
}

function privateAuthHeaderValue(localEnv) {
  return localEnv.STATIK_PRIVATE_AUTH_HEADER_VALUE || process.env.STATIK_PRIVATE_AUTH_HEADER_VALUE;
}

function privateAuthHeaders(localEnv) {
  const headers = new Headers();
  const name = privateAuthHeaderName(localEnv);
  const value = privateAuthHeaderValue(localEnv);
  if (name && value) {
    headers.set(name, value);
  }
  return headers;
}

async function loadUiMeta(cwd, workerOrigin, localEnv = {}) {
  const useIndexJson = await readUseIndexJson(cwd);
  return makeUiMeta(workerOrigin, {
    useIndexJson,
    privateAuthHeaderName: privateAuthHeaderName(localEnv),
    publicManifestPath: publicManifestPathFor(useIndexJson),
  });
}

async function readBuildToken(cwd, localEnv = {}) {
  if (localEnv.STATIK_BUILD_TOKEN) return localEnv.STATIK_BUILD_TOKEN;
  const wranglerPath = path.join(cwd, 'wrangler.toml');
  try {
    const raw = await fs.readFile(wranglerPath, 'utf8');
    return (
      readTomlVar(raw, 'STATIK_BUILD_TOKEN') || process.env.STATIK_BUILD_TOKEN || ''
    );
  } catch {
    return process.env.STATIK_BUILD_TOKEN || '';
  }
}

async function readUseIndexJson(cwd) {
  const wranglerPath = path.join(cwd, 'wrangler.toml');
  try {
    const raw = await fs.readFile(wranglerPath, 'utf8');
    const value = readTomlVar(raw, 'STATIK_USE_INDEX_JSON');
    if (value != null) return String(value).toLowerCase() === 'true';
  } catch {
    // ignore
  }
  return String(process.env.STATIK_USE_INDEX_JSON || 'false').toLowerCase() === 'true';
}

function readTomlVar(toml, key) {
  const lines = String(toml || '').split(/\r?\n/);
  let inVars = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inVars = trimmed.toLowerCase() === '[vars]';
      continue;
    }
    if (!inVars) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']+)["']/);
    if (match && match[1] === key) return match[2];
  }
  return null;
}

function publicManifestPathFor(useIndexJson) {
  return useIndexJson ? '/public/_manifest/index.json' : '/public/_manifest';
}

export function diffManifestRoutes(prev, next) {
  const prevMap = new Map(prev.map((entry) => [entry.route, entry.hash || entry.mtime || '']));
  const nextMap = new Map(next.map((entry) => [entry.route, entry.hash || entry.mtime || '']));
  const changed = new Set();

  for (const [route, sig] of nextMap) {
    if (prevMap.get(route) !== sig) changed.add(route);
  }
  for (const route of prevMap.keys()) {
    if (!nextMap.has(route)) changed.add(route);
  }

  return Array.from(changed).sort();
}

export async function loadLocalEnv(cwd) {
  const envFile = path.join(cwd, '.dev.vars');
  try {
    const raw = await fs.readFile(envFile, 'utf8');
    return parseEnvFile(raw);
  } catch {
    return {};
  }
}

function parseEnvFile(raw) {
  const out = {};
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function pickForwardHeaders(headers) {
  const out = {
    'Content-Type': headers.get('content-type') || 'application/json; charset=utf-8',
  };
  const etag = headers.get('etag');
  const cacheControl = headers.get('cache-control');
  if (etag) out.ETag = etag;
  if (cacheControl) out['Cache-Control'] = cacheControl;
  return out;
}

function streamFile(file, res) {
  const ext = path.extname(file).toLowerCase();
  const ctype =
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.js'
        ? 'text/javascript; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.json'
            ? 'application/json; charset=utf-8'
            : ext === '.svg'
              ? 'image/svg+xml'
              : ext === '.map'
                ? 'application/json; charset=utf-8'
                : 'application/octet-stream';
  res.setHeader('Content-Type', ctype);
  fss.createReadStream(file).pipe(res);
}

export function resolveUiDist() {
  const fromEnv = process.env.STATIKAPI_UI_DIR;
  if (fromEnv && hasIndex(fromEnv)) return fromEnv;

  const bundled = path.resolve(__dirname, '..', '..', 'ui');
  if (hasIndex(bundled)) return bundled;

  const monorepoDist = path.resolve(__dirname, '..', '..', '..', 'ui', 'dist');
  if (hasIndex(monorepoDist)) return monorepoDist;

  throw new Error(
    'StatikAPI UI build not found for Cloudflare preview. ' +
      'Either keep a built UI at packages/adapter-cloudflare/ui/ or set STATIKAPI_UI_DIR.'
  );
}

function hasIndex(dir) {
  return fss.existsSync(path.join(dir, 'index.html'));
}
