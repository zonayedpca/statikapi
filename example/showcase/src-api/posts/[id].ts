export async function paths() {
  // first 10 posts
  return Array.from({ length: 10 }, (_, i) => String(i + 1));
}

export async function data({ params }: { params: { id: string } }) {
  const res = await fetch(`https://jsonplaceholder.typicode.com/posts/${params.id}`);
  const post = await res.json();

  const commentsRes = await fetch(
    `https://jsonplaceholder.typicode.com/posts/${params.id}/comments`
  );
  const comments = await commentsRes.json();

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    comments: comments.map((c: any) => ({ id: c.id, name: c.name, email: c.email })),
  };
}
