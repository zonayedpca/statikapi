
export async function paths(){ return ['1','2']; }
export async function data({ params }){ return { user: params.id }; }
