export async function paths() {
  // Builds /docs/a/b and /docs/guide
  return [['a', 'b'], ['guide']];
}

export async function data({ params }) {
  return {
    slug: params.slug,
    path: params.slug.join('/'),
    kind: params.slug.length > 1 ? 'section' : 'page',
    generatedAt: new Date().toISOString(),
  };
}
