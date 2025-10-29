import path from 'node:path';

/** Map a route to an output JSON file (index.json style). Static routes only. */
export function routeToOutPath({ outAbs, route }) {
  // '/' -> index.json, '/users' -> users/index.json, '/blog/archive' -> blog/archive/index.json
  const rel = route === '/' ? 'index.json' : route.slice(1) + '/index.json';

  return path.join(outAbs, rel);
}
