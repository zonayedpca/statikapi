export default async function initCmd(argv) {
  // Delegate to create-statikapi programmatically
  const { main } = await import('create-statikapi/src/index.js');
  return (await main(argv), 0);
}
