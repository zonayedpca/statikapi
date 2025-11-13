export async function paths() {
  return ['1', '2', '3', '4', '5', '6'];
}

export async function data({ params }) {
  return {
    id: params.id,
    extra: 'value',
    generatedAt: new Date().toISOString(),
  };
}
