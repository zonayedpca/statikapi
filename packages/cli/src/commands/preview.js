import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { readFlags } from '../util/readFlags.js';
import { loadConfig } from '../config/loadConfig.js';
import { routeToOutPath } from '../build/routeOutPath.js';

export default async function previewCmd(argv) {
  // Keep old tests green: in non-TTY (node --test), behave like stub and exit.
  if (!process.stdout.isTTY) {
    console.log('staticapi preview → previewing built JSON (stub)');
    return 0;
  }

  const flags = readFlags(argv || []);
  const host = String(flags.host ?? '127.0.0.1');
  const port = Number.isFinite(flags.port) ? Number(flags.port) : 8788;
  const autoOpen = flags.open === true;

  const { config } = await loadConfig({ flags });

  const uiDir = flags.uiDir ? path.resolve(String(flags.uiDir)) : null;
  const hasUi = uiDir && fss.existsSync(uiDir);

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
  const manifestPath = path.join(outDir, '.staticapi', 'manifest.json');

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

  function htmlShell() {
    // Minimal SPA shell
    return `<!doctype html>
 <html lang="en">
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
 <title>StaticAPI Preview</title>
 <style>
:root { color-scheme: light dark; }
body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; }
header { padding: 12px 16px; border-bottom: 1px solid #00000022; }
main { display: grid; grid-template-columns: 320px 1fr; min-height: calc(100vh - 49px); }
aside { border-right: 1px solid #00000022; padding: 12px; overflow:auto; }
section { padding: 12px; }
.route { display: block; padding: 6px 8px; border-radius: 8px; text-decoration: none; color: inherit; }
.route:hover { background: #00000010; }
pre { white-space: pre-wrap; word-break: break-word; background: #00000008; padding: 12px; border-radius: 8px; }
.muted { opacity: .7; font-size: 12px; }
 </style>
 <header>
<strong>StaticAPI Preview</strong>
<span class="muted">— quick viewer</span>
 </header>
 <main>
<aside>
  <div id="count" class="muted">Loading manifest…</div>
  <nav id="list"></nav>
</aside>
<section>
  <div class="muted">Select a route from the left to view its JSON.</div>
  <pre id="view"></pre>
</section>
 </main>
 <script type="module">
const $count = document.getElementById('count');
const $list = document.getElementById('list');
const $view = document.getElementById('view');
 
async function loadManifest() {
  const res = await fetch('/ui/index', { cache: 'no-store' });
  const list = await res.json();
  $count.textContent = list.length + ' route(s)';
  $list.innerHTML = '';
  for (const e of list) {
    const a = document.createElement('a');
    a.className = 'route';
    a.href = '#'+encodeURIComponent(e.route);
    a.textContent = e.route;
    a.onclick = (ev) => {
      ev.preventDefault();
      showRoute(e.route);
    };
    $list.appendChild(a);
  }
}
 
async function showRoute(route) {
  const res = await fetch('/_ui/file?route=' + encodeURIComponent(route), { cache: 'no-store' });
  if (!res.ok) {
    $view.textContent = 'Failed to load: ' + route + '\\n' + (await res.text());
    return;
  }
  const txt = await res.text();
  try {
    const obj = JSON.parse(txt);
    $view.textContent = JSON.stringify(obj, null, 2);
  } catch {
    $view.textContent = txt;
  }
}
 
// simple hash-router for convenience
window.addEventListener('hashchange', () => {
  const r = decodeURIComponent(location.hash.slice(1));
  if (r) showRoute(r);
});
 
await loadManifest();
const initial = decodeURIComponent(location.hash.slice(1));
if (initial) showRoute(initial);

// Live reload (SSE)
const es = new EventSource('/_ui/events');
es.onmessage = async (ev) => {
  const msg = String(ev.data || '');
  if (msg.startsWith('changed:')) {
    const route = msg.slice('changed:'.length);
    try { await loadManifest(); } catch {}
    const current = decodeURIComponent(location.hash.slice(1));
    if (current && route && current === route) {
      showRoute(route);
    }
  }
};
 </script>
 `;
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

    // UI root
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
      const html = htmlShell();
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
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
        'X-StaticAPI-Route': route,
        'X-StaticAPI-File': path.relative(process.cwd(), fileAbs).replaceAll(path.sep, '/'),
        'Cache-Control': 'no-store',
      });
      fss.createReadStream(fileAbs).pipe(res);
      return;
    }

    // Serve built UI (if provided)
    if (hasUi && (pathname.startsWith('/_ui') || pathname.startsWith('/ui'))) {
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
  console.log(`staticapi preview → serving ${path.relative(process.cwd(), outDir) || outDir}`);
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
