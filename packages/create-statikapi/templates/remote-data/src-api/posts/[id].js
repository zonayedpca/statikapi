// Prebuild 10 posts so this stays static; swap logic for your API
export async function paths() {
  return Array.from({ length: 10 }, (_, i) => String(i + 1));
}

export async function data({ params }) {
  const id = params.id;
  const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { error: `Upstream HTTP ${res.status}`, id };

  const post = await res.json();
  return {
    source: 'remote',
    id,
    post,
    generatedAt: new Date().toISOString(),
  };
}
