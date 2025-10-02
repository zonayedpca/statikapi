export async function getManifest() {
  const res = await fetch('/ui/index', { cache: 'no-store' });
  if (!res.ok) throw new Error(`manifest failed: ${res.status}`);
  return res.json();
}

export async function getRouteText(route) {
  const res = await fetch('/_ui/file?route=' + encodeURIComponent(route), { cache: 'no-store' });
  if (!res.ok) throw new Error(`route ${route} failed: ${res.status}`);
  return res.text();
}
