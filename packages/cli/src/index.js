import { createRequire } from 'node:module';
import { HELP } from './help.js';
import buildCmd from './commands/build.js';
import devCmd from './commands/dev.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

export async function run(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(HELP);

    return 0;
  }

  if (cmd === '-v' || cmd === '--version') {
    console.log(`statikapi v${version}`);

    return 0;
  }

  switch (cmd) {
    case 'build':
      return await buildCmd(rest);
    case 'dev':
      return await devCmd(rest);
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      return 1;
  }
}
