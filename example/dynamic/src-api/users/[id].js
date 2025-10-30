export async function paths() {
  // Build seven concrete routes: /users/1 ... /users/7
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
}

export async function data({ params }) {
  return {
    id: params.id,
    role: Number(params.id) % 2 === 0 ? 'editor' : 'viewer',
  };
}
