import { HELP } from './help.js';
import initCmd from './commands/init.js';
import buildCmd from './commands/build.js';
import devCmd from './commands/dev.js';
import previewCmd from './commands/preview.js';

export async function run(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === '-h' || cmd === '--help') {
    console.log(HELP);
    return 0;
  }
  if (cmd === '-v' || cmd === '--version') {
    // keep version in sync with package.json manually for now
    console.log('staticapi v0.1.0');
    return 0;
  }

  switch (cmd) {
    case 'init':
      await initCmd(rest);
      return 0;
    case 'build':
      await buildCmd(rest);
      return 0;
    case 'dev':
      await devCmd(rest);
      return 0;
    case 'preview':
      await previewCmd(rest);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      return 1;
  }
}
