// packages/ui/src/lib/snippets.js

function getOrigin() {
  // Avoid touching `window` at import time; work in any env.
  if (typeof globalThis !== 'undefined' && globalThis.location && globalThis.location.origin) {
    return globalThis.location.origin;
  }
  // Fallback (kept empty so snippets still copy valid code; the UI runs in-browser anyway)
  return '';
}

/** Build an absolute endpoint URL for a given route (e.g., "/users/1"). */
export function endpointUrl(route, originOverride) {
  const origin = originOverride || getOrigin();
  return origin + route;
}

/** Return snippet strings for curl, browser fetch, and Node (built-in) fetch. */
export function makeSnippets(route, { origin } = {}) {
  const url = endpointUrl(route, origin);
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
