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

export function formatManualSeedInstructions(workerUrl = 'YOUR_WORKER_URL') {
  const origin = String(workerUrl || '').trim() || 'YOUR_WORKER_URL';
  return [
    'To seed private outputs manually, send a POST request to your deployed Worker.',
    '',
    'Before seeding, make sure the deployed Worker has the same secrets as your local `.dev.vars`:',
    '',
    '- `STATIK_BUILD_TOKEN`',
    '- `STATIK_PRIVATE_AUTH_HEADER_NAME`',
    '- `STATIK_PRIVATE_AUTH_HEADER_VALUE`',
    '',
    'You can set them with Wrangler:',
    '',
    'wrangler secret put STATIK_BUILD_TOKEN',
    'wrangler secret put STATIK_PRIVATE_AUTH_HEADER_NAME',
    'wrangler secret put STATIK_PRIVATE_AUTH_HEADER_VALUE',
    '',
    'Or add them in the Cloudflare dashboard under Worker secrets.',
    '',
    'Example:',
    '',
    `curl -X POST "${origin}/" \\`,
    '  -H "Authorization: Bearer YOUR_STATIK_BUILD_TOKEN"',
    '',
    'Use `STATIK_BUILD_TOKEN` for this POST request.',
    '`STATIK_PRIVATE_AUTH_HEADER_NAME` and `STATIK_PRIVATE_AUTH_HEADER_VALUE` are for private reads, not for seeding.',
  ].join('\n');
}

export async function seedRemoteBuild(workerOrigin, buildToken, routePath = '/') {
  const origin = String(workerOrigin || '').replace(/\/+$/, '');
  const token = String(buildToken || '');

  if (!origin) {
    return { seeded: false, skipped: true, reason: 'worker origin is required' };
  }

  if (!token) {
    return { seeded: false, skipped: true, reason: 'STATIK_BUILD_TOKEN is required' };
  }

  try {
    await triggerRemoteBuild(origin, token, routePath);
    return { seeded: true, skipped: false };
  } catch (error) {
    return { seeded: false, skipped: false, error };
  }
}

export function normalizeBuildRoutePath(routePath = '/') {
  const raw = String(routePath || '/').trim();
  if (!raw || raw === '/') return '/';
  return raw.startsWith('/') ? raw : '/' + raw;
}
