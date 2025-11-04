type Todo = { id: number; title: string; completed: boolean };

export async function data() {
  const res = await fetch('https://jsonplaceholder.typicode.com/todos?_limit=8');
  const todos: Todo[] = await res.json();
  return todos.map((t) => ({ id: t.id, title: t.title, completed: t.completed }));
}
