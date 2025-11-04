type User = { id: number; name: string; username: string; email: string };

export async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  const users: User[] = await res.json();

  // Return a trimmed, serializable list
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
  }));
}
