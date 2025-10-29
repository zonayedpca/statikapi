// Builds /posts with first 10 posts (demo source: jsonplaceholder)
export default async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { error: `Upstream HTTP ${res.status}` };

  const posts = await res.json();
  return {
    source: 'remote',
    count: posts.length,
    posts,
    generatedAt: new Date().toISOString(),
  };
}
