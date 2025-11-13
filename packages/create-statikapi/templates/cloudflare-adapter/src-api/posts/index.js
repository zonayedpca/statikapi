export async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');
  const posts = await res.json();

  return {
    total: posts.length,
    items: posts.map((p) => ({
      id: p.id,
      title: p.title,
      userId: p.userId,
    })),
    generatedAt: new Date().toISOString(),
  };
}
