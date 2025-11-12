
export async function paths(){ return [['a','b'], ['guide']]; }
export async function data({ params }){ return { doc: params.slug.join('/') }; }
