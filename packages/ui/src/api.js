export async function getManifest() {
  const res = await fetch('/ui/index', { cache: 'no-store' });
  if (!res.ok) throw new Error(`manifest failed: ${res.status}`);

  return res.json();
}

export async function getRoute(route) {
  const res = await fetch('/_ui/file?route=' + encodeURIComponent(route), { cache: 'no-store' });
  if (!res.ok) throw new Error(`route ${route} failed: ${res.status}`);
  const text = await res.text();
  // Extract a few standard headers (may be absent)
  const headers = {
    'content-type': res.headers.get('content-type'),
    etag: res.headers.get('etag'),
    'cache-control': res.headers.get('cache-control'),
  };
  return { text, headers };
}
