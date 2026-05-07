function getOrigin() {
  // Avoid touching `window` at import time; work in any env.
  if (typeof globalThis !== 'undefined' && globalThis.location && globalThis.location.origin) {
    return globalThis.location.origin;
  }

  // Fallback (kept empty so snippets still copy valid code; the UI runs in-browser anyway)
  return '';
}

function normalizeOrigin(origin) {
  return (origin || getOrigin()).replace(/\/+$/, '');
}

/** Build an absolute endpoint URL for a given route (e.g., "/users/1"). */
export function endpointUrl(route, { entry, meta } = {}) {
  const origin = normalizeOrigin(meta?.origin);

  if (meta?.mode === 'cloudflare') {
    if (entry?.public && entry?.filePath) {
      return origin + '/' + String(entry.filePath).replace(/^\/+/, '');
    }
    return origin + (route === '/' ? '/' : route);
  }

  return origin + (route === '/' ? '/' : `${route}/`) + 'index.json';
}

/** Return snippet strings for curl, browser fetch, and Node (built-in) fetch. */
export function makeSnippets(route, { entry, meta } = {}) {
  const url = endpointUrl(route, { entry, meta });
  const q = JSON.stringify(url); // safe in JS strings

  const curl = `curl -sS -H "Accept: application/json" ${q}`;

  const browser = `fetch(${q}, {
  headers: { Accept: 'application/json' },
  cache: 'no-store'
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);`;

  const node = `// Node 18+ has global fetch
const res = await fetch(${q}, {
  headers: { Accept: 'application/json' }
});
if (!res.ok) throw new Error('HTTP ' + res.status);
const json = await res.json();
console.log(json);

// If you prefer Undici instead:
// import { fetch } from 'undici'; // npm i undici
`;

  return { curl, browser, node, url };
}
