export async function paths() {
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
}

export async function data({ params }) {
  return { id: params.id, extra: 'value' };
}
