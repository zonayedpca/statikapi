export async function paths() {
  return ['1', '2', '3'];
}

export async function data({ params }) {
  return { id: params.id };
}
