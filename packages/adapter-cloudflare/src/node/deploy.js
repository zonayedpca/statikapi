export async function triggerRemoteBuild(workerOrigin, buildToken, routePath = '/') {
  const origin = String(workerOrigin || '').replace(/\/+$/, '');
  if (!origin) {
    throw new Error('worker origin is required');
  }

  const token = String(buildToken || '');
  if (!token) {
    throw new Error('STATIK_BUILD_TOKEN is required to trigger a remote build');
  }

  const targetPath = normalizeBuildRoutePath(routePath);
  const res = await fetch(new URL(targetPath, origin), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`remote build failed: ${res.status}`);
  }

  return true;
}

export function normalizeBuildRoutePath(routePath = '/') {
  const raw = String(routePath || '/').trim();
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : '/' + raw;
}

