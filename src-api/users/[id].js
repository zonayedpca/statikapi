export async function paths() {
  return ['1', '2', '3', '4'];
}

export async function data({ params }) {
  return { id: params.id, extra: 'info' };
}
