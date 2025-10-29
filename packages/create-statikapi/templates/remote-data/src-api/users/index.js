// Builds /users with first 5 users (demo source: jsonplaceholder)
export default async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/users?_limit=5', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return { error: `Upstream HTTP ${res.status}` };

  const users = await res.json();
  return {
    source: 'remote',
    count: users.length,
    users,
    generatedAt: new Date().toISOString(),
  };
}
