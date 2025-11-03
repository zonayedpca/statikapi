import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import kleur from 'kleur';

import { mkdirp, copy, writeJson, renameInFiles } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(__dirname, 'templates');

export async function main(argv = process.argv.slice(2)) {
  const givenName = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;

  const answers = await prompts(
    [
      {
        type: givenName ? null : 'text',
        name: 'name',
        message: 'Project name',
        initial: 'my-statikapi',
        validate: (v) => (!!v && /^[a-z0-9-_.@/]+$/i.test(v)) || 'Invalid name',
      },
      {
        type: 'select',
        name: 'template',
        message: 'Choose a template',
        choices: [
          { title: 'basic (single endpoint)', value: 'basic' },
          { title: 'dynamic (params + catch-all)', value: 'dynamic' },
        ],
        initial: 0,
      },
      {
        type: 'confirm',
        name: 'install',
        message: 'Install dependencies now (pnpm/npm/yarn)?',
        initial: true,
      },
      {
        type: (prev) => (prev ? 'select' : null),
        name: 'pm',
        message: 'Package manager',
        choices: [
          { title: 'pnpm', value: 'pnpm' },
          { title: 'npm', value: 'npm' },
          { title: 'yarn', value: 'yarn' },
        ],
        initial: 0,
      },
    ],
    {
      onCancel: () => {
        console.log(kleur.yellow('Aborted.'));
        process.exit(0);
      },
    }
  );

  const name = givenName || answers.name;
  const dest = path.resolve(process.cwd(), name);
  const templateDir = path.join(TPL, answers.template);

  await mkdirp(dest);
  await copy(templateDir, dest);

  // Rename package name
  await writeJson(path.join(dest, 'package.json'), (pkg) => {
    pkg.name = name;
    return pkg;
  });

  // Replace readme placeholders if any
  await renameInFiles(dest, [{ search: /__NAME__/g, replace: name }]);

  console.log(kleur.green(`\n✔ Created ${name}\n`));

  // Optionally install
  if (answers.install) {
    const pm = answers.pm || 'pnpm';
    const { spawn } = await import('node:child_process');
    await new Promise((resolve) => {
      const child = spawn(pm, ['install'], { cwd: dest, stdio: 'inherit' });
      child.on('close', () => resolve());
    });
    console.log(kleur.green(`\n✔ Installed deps using ${pm}\n`));
  }

  console.log('Next steps:\n');
  console.log(`  cd ${name}`);
  console.log(
    '  pnpm dev    # watch & rebuild API (uses your globally installed statikapi or npx)'
  );
  console.log('\nHappy building!');
}
