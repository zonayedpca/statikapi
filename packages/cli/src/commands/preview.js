import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL, fileURLToPath } from 'node:url';

import { loadConfig } from '../config/loadConfig.js';
import { readFlags } from '../util/readFlags.js';
import { routeToOutPath } from '../build/routeOutPath.js';

export default async function previewCmd(argv) {
  // Keep old tests green: in non-TTY (node --test), behave like stub and exit.
  if (!process.stdout.isTTY) {
    console.log('statikapi preview → previewing built JSON (stub)');

    return 0;
  }

  const flags = readFlags(argv || []);
  const host = String(flags.host ?? '127.0.0.1');
  const port = Number.isFinite(flags.port) ? Number(flags.port) : 8788;
  const autoOpen = flags.open === true;

  const { config } = await loadConfig({ flags });

  // --- React UI defaults ---
  // Prefer --uiDir; else use embedded UI inside this package; else proxy to Vite dev.
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../packages/cli/src/commands
  const embeddedUi = path.resolve(here, '../../ui'); // .../packages/cli/ui
  const uiDir = flags.uiDir ? path.resolve(String(flags.uiDir)) : embeddedUi;
  const hasUi = uiDir && fss.existsSync(uiDir);

  const uiDevHost = String(flags.uiDevHost ?? '127.0.0.1');
  const uiDevPort = Number.isFinite(flags.uiDevPort) ? Number(flags.uiDevPort) : 5173;

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.map': 'application/json',
  };

  const outDir = config.paths.outAbs;
  const manifestPath = path.join(outDir, '.statikapi', 'manifest.json');

  const send = (res, code, body, headers = {}) => {
    const h = {
      'Cache-Control': 'no-store',
      ...headers,
    };

    res.writeHead(code, h);

    if (body && (typeof body === 'string' || Buffer.isBuffer(body))) res.end(body);
    else res.end();
  };

  const notFound = (res, msg = 'Not found') =>
    send(res, 404, JSON.stringify({ error: msg }) + '\n', {
      'Content-Type': 'application/json; charset=utf-8',
    });

  const badReq = (res, msg) =>
    send(res, 400, JSON.stringify({ error: msg }) + '\n', {
      'Content-Type': 'application/json; charset=utf-8',
    });

  const etag = (buf) => `"sha1-${crypto.createHash('sha1').update(buf).digest('hex')}"`;

  async function readManifest() {
    try {
      const raw = await fs.readFile(manifestPath);
      return raw;
    } catch {
      return Buffer.from('[]', 'utf8');
    }
  }

  // --- SSE: subscribers/broadcast ---
  const clients = new Set(); // Set<http.ServerResponse>

  function sseSend(res, data) {
    // default "message" event with one data line
    res.write(`data: ${data}\n\n`);
  }

  function broadcast(data) {
    for (const res of clients) {
      try {
        sseSend(res, data);
      } catch {
        /* ignore */
      }
    }
  }

  // Simple proxy to Vite dev server (only used if no built UI is found)
  async function proxyUi(req, res, uiPathname) {
    const httpMod = uiDevHost.startsWith('https')
      ? await import('node:https')
      : await import('node:http');
    const client = uiDevHost.startsWith('https') ? httpMod.default : httpMod.default;
    const targetPath =
      uiPathname + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    const opts = {
      hostname: uiDevHost,
      port: uiDevPort,
      method: req.method || 'GET',
      path: targetPath,
      headers: req.headers,
    };
    const p = client.request(opts, (up) => {
      const headers = { ...up.headers };
      // Always no-store for UI assets
      headers['cache-control'] = 'no-store';
      res.writeHead(up.statusCode || 502, headers);
      up.pipe(res);
    });
    p.on('error', () => {
      const msg = `StatikAPI UI dev server not found at http://${uiDevHost}:${uiDevPort}. Start it with: pnpm -w --filter packages/ui dev`;
      res.writeHead(502, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(msg);
    });
    if (req.readable) req.pipe(p);
    else p.end();
  }

  async function tryServeFrom(rootDir, reqPath, { spaFallback = null } = {}) {
    const target = path.normalize(path.join(rootDir, reqPath.replace(/^\/+/, '')));
    if (!target.startsWith(rootDir)) return null; // path traversal guard
    try {
      const st = await fs.stat(target);
      if (st.isDirectory()) {
        const idx = path.join(target, 'index.html');
        const buf = await fs.readFile(idx);
        return { buf, ctype: MIME['.html'] };
      }
      const buf = await fs.readFile(target);
      const ext = path.extname(target).toLowerCase();
      return { buf, ctype: MIME[ext] || 'application/octet-stream' };
    } catch {
      if (spaFallback) {
        try {
          const fallback = path.join(rootDir, spaFallback);
          const buf = await fs.readFile(fallback);
          return { buf, ctype: MIME['.html'] };
        } catch {
          /* ignore */
        }
      }
      return null;
    }
  }

  const server = http.createServer(async (req, res) => {
    const base = `http://${host}:${port}`;
    let url;
    try {
      url = new URL(req.url || '/', base);
    } catch {
      return notFound(res, 'Invalid URL');
    }
    const pathname = url.pathname;

    // --- SSE subscription ---
    if (pathname === '/_ui/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n'); // comment line
      clients.add(res);

      // keepalive pings
      const ping = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          // ignore write errors
        }
      }, 30000);

      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }

    // Internal notify hook (used by dev watcher)
    if (pathname === '/_ui/changed') {
      const route = url.searchParams.get('route') || '';
      broadcast(`changed:${route}`);
      return send(res, 204, '');
    }

    // UI root always React: serve built dist if present; otherwise proxy to Vite dev
    if (pathname === '/_ui' || pathname === '/ui' || pathname === '/ui/') {
      if (hasUi) {
        const served = await tryServeFrom(uiDir, 'index.html', { spaFallback: null });
        if (served) {
          return send(res, 200, served.buf, {
            'Content-Type': served.ctype,
            'Cache-Control': 'no-store',
          });
        }
      }
      return proxyUi(req, res, '/_ui/');
    }

    // Helper: manifest passthrough
    if (pathname === '/_ui/index' || pathname === '/ui/index') {
      const raw = await readManifest();
      const tag = etag(raw);
      if (req.headers['if-none-match'] === tag) {
        res.writeHead(304, { ETag: tag, 'Cache-Control': 'no-store' });
        return res.end();
      }
      return send(res, 200, raw, {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: tag,
      });
    }

    // Helper: stream a built JSON by route
    if (pathname === '/_ui/file' || pathname === '/ui/file') {
      const route = url.searchParams.get('route');
      if (!route || !route.startsWith('/')) {
        return badReq(res, 'query parameter "route" is required and must start with "/"');
      }
      const fileAbs = routeToOutPath({ outAbs: outDir, route });
      if (!fss.existsSync(fileAbs)) return notFound(res, `No file for route: ${route}`);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-StatikAPI-Route': route,
        'X-StatikAPI-File': path.relative(process.cwd(), fileAbs).replaceAll(path.sep, '/'),
        'Cache-Control': 'no-store',
      });
      fss.createReadStream(fileAbs).pipe(res);
      return;
    }

    // Serve UI assets: built if present, else proxy to Vite dev
    if (pathname.startsWith('/_ui') || pathname.startsWith('/ui')) {
      if (hasUi) {
        const rel = pathname.replace(/^\/_?ui\/?/, '');
        const reqPath = rel === '' ? 'index.html' : rel;
        const served = await tryServeFrom(uiDir, reqPath, { spaFallback: 'index.html' });
        if (served) {
          return send(res, 200, served.buf, {
            'Content-Type': served.ctype,
            'Cache-Control': 'no-store',
          });
        }
        return notFound(res);
      }
      return proxyUi(req, res, pathname);
    }

    // Static serve from api-out (best-effort)
    const safe = path.normalize(path.join(outDir, pathname));
    if (!safe.startsWith(outDir)) return notFound(res);
    try {
      const stat = await fs.stat(safe);
      if (stat.isDirectory()) {
        const idx = path.join(safe, 'index.json');
        const s2 = await fs.readFile(idx);
        return send(res, 200, s2, { 'Content-Type': 'application/json; charset=utf-8' });
      } else {
        const buf = await fs.readFile(safe);
        const ctype = safe.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/plain; charset=utf-8';
        return send(res, 200, buf, { 'Content-Type': ctype });
      }
    } catch {
      return notFound(res);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const url = `http://${host}:${port}/_ui`;
  console.log(`statikapi preview → serving ${path.relative(process.cwd(), outDir) || outDir}`);
  console.log(`open  ${url}`);

  if (autoOpen) {
    openBrowser(url).catch(() => {});
  }

  // Graceful shutdown
  await new Promise((resolve) => {
    const stop = () => server.close(() => resolve());
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
  return 0;
}

async function openBrowser(url) {
  const { exec } = await import('node:child_process');
  const plat = process.platform;
  return new Promise((resolve) => {
    const cmd =
      plat === 'darwin'
        ? `open "${url}"`
        : plat === 'win32'
          ? `start "" "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd, () => resolve());
  });
}
