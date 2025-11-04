export async function paths() {
  // Two catch-all pages:
  //   /docs/getting-started
  //   /docs/guides/typescript/support
  return [['getting-started'], ['guides', 'typescript', 'support']];
}

export async function data({ params }: { params: { slug: string[] } }) {
  return {
    kind: 'docs',
    slug: params.slug,
    path: params.slug.join('/'),
  };
}
