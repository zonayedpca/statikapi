export default async function initCmd() {
  console.log('statikapi init → use `npx create-statikapi <name>` to scaffold a new project.');
}

// after publishing, replace the above with the below:
// export default async function initCmd(argv) {
//   // Delegate to create-statikapi programmatically
//   const { main } = await import('create-statikapi/src/index.js');
//   return (await main(argv), 0);
// }
