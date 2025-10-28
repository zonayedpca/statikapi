export async function paths() {
  return [['intro'], ['guide', 'install']];
}
export async function data({ params }) {
  return { slug: params.slug, path: params.slug.join('/') };
}
