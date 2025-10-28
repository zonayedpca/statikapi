export async function paths() {
  return ['1', '2', '3'];
}
export async function data({ params }) {
  return { id: params.id, role: Number(params.id) % 2 === 0 ? 'editor' : 'viewer' };
}
