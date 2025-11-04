type Post = { id: number; userId: number; title: string };

export async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');
  const posts: Post[] = await res.json();

  return {
    total: posts.length,
    items: posts.map((p) => ({ id: p.id, title: p.title, userId: p.userId })),
  };
}
