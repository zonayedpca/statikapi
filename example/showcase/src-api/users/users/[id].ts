type User = { id: number; name: string; username: string; email: string };

export async function paths() {
  // Limit to first 5 users to keep builds snappy
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();
  return users.slice(0, 5).map((u) => String(u.id));
}

export async function data({ params }: { params: { id: string } }) {
  const id = params.id;
  const [userRes, postsRes] = await Promise.all([
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`),
    fetch(`https://jsonplaceholder.typicode.com/users/${id}/posts`),
  ]);

  // Minimal shaping to guarantee plain JSON objects/arrays
  const user = await userRes.json();
  const posts = await postsRes.json();

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    posts: posts.map((p: any) => ({ id: p.id, title: p.title })),
  };
}
