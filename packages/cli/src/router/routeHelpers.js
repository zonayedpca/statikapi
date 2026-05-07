export function toConcreteRoute(routePattern, segs) {
  let idx = 0;

  const parts = routePattern.split('/').map((p) => {
    if (p.startsWith(':')) return segs[idx++] ?? '';
    if (p.startsWith('*')) return segs.slice(idx).join('/');
    return p;
  });

  return parts.join('/').replace(/\/+/g, '/');
}

export function toParams(segTokens, concreteRoute) {
  const concreteSegs = concreteRoute.split('/').filter(Boolean);
  const params = {};

  for (let i = 0; i < segTokens.length; i++) {
    const tok = segTokens[i];
    if (tok.startsWith(':')) {
      params[tok.slice(1)] = concreteSegs[i] ?? '';
    } else if (tok.startsWith('*')) {
      params[tok.slice(1)] = concreteSegs.slice(i);
      break;
    }
  }

  return params;
}

export function collectionRouteForSegments(segTokens) {
  const last = segTokens[segTokens.length - 1];
  if (!last || (!last.startsWith(':') && !last.startsWith('*'))) return null;

  const parent = segTokens.slice(0, -1);
  if (parent.some((tok) => tok.startsWith(':') || tok.startsWith('*'))) return null;

  return parent.length ? '/' + parent.join('/') : '/';
}
