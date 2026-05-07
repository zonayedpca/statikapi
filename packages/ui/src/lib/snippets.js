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
    return origin + (route === '/' ? '/' : route);
  }

  return origin + (route === '/' ? '/' : `${route}/`) + 'index.json';
}

/** Return snippet strings for curl, browser fetch, and Node (built-in) fetch. */
export function makeSnippets(route, { entry, meta } = {}) {
  const url = endpointUrl(route, { entry, meta });
  const q = JSON.stringify(url); // safe in JS strings
  const isPrivateCloudflare = meta?.mode === 'cloudflare' && entry?.public === false;
  const privateHeaderName = meta?.privateAuthHeaderName || 'x-private-auth';
  const privateHeaderValue = '<YOUR_PRIVATE_AUTH_VALUE>';
  const curlAuth = isPrivateCloudflare
    ? ` -H "${privateHeaderName}: ${privateHeaderValue}"`
    : '';
  const jsHeaderBlock = isPrivateCloudflare
    ? `,
  ${JSON.stringify(privateHeaderName)}: ${JSON.stringify(privateHeaderValue)}`
    : '';
  const privateNote = isPrivateCloudflare
    ? `\n// Private route: replace ${privateHeaderValue} with your configured private auth value\n`
    : '\n';

  const curl = `curl -sS -H "Accept: application/json"${curlAuth} ${q}`;

  const browser = `fetch(${q}, {
  headers: { Accept: 'application/json'${jsHeaderBlock} },
  cache: 'no-store'
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);${privateNote}`;

  const node = `// Node 18+ has global fetch${privateNote}
const res = await fetch(${q}, {
  headers: { Accept: 'application/json'${jsHeaderBlock} }
});
if (!res.ok) throw new Error('HTTP ' + res.status);
const json = await res.json();
console.log(json);

// If you prefer Undici instead:
// import { fetch } from 'undici'; // npm i undici
`;

  return { curl, browser, node, url };
}
