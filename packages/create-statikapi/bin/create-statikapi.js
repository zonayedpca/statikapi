#!/usr/bin/env node
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const TEMPLATES = new Set(['basic', 'dynamic', 'remote-data']);
const DEFAULT_TEMPLATE = 'basic';
const DEFAULT_PM = 'pnpm';

async function main(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Collect inputs, prompting only if missing and we're in TTY & not --yes
  const interactive = process.stdout.isTTY && !args.yes;

  let appName = args._[0] || null;
  let template = (args.template || '').toLowerCase();
  let pkgMgr = String(args['package-manager'] || '');
  const doInstall = !args['no-install'];

  if (interactive) {
    const { default: prompts } = await import('prompts');

    const answers = await prompts(
      [
        appName
          ? null
          : {
              type: 'text',
              name: 'name',
              message: 'Project name',
              initial: 'my-statikapi',
              validate: (v) => (!!v && /^[a-z0-9-_.@/]+$/i.test(v)) || 'Invalid name',
            },
        TEMPLATES.has(template)
          ? null
          : {
              type: 'select',
              name: 'template',
              message: 'Choose a template',
              choices: [
                { title: 'basic (single endpoint)', value: 'basic' },
                { title: 'dynamic (params + catch-all)', value: 'dynamic' },
                { title: 'remote-data (build-time API fetch)', value: 'remote-data' },
              ],
              initial: 0,
            },
        pkgMgr
          ? null
          : {
              type: 'select',
              name: 'pm',
              message: 'Which package manager?',
              choices: [
                { title: 'pnpm (recommended)', value: 'pnpm' },
                { title: 'yarn', value: 'yarn' },
                { title: 'npm', value: 'npm' },
              ],
              initial: 0,
            },
      ].filter(Boolean),
      {
        onCancel: () => {
          console.log('Aborted.');
          process.exit(0);
        },
      }
    );

    appName = appName || answers.name;
    template = TEMPLATES.has(template) ? template : answers.template || DEFAULT_TEMPLATE;
    pkgMgr = pkgMgr || answers.pm || DEFAULT_PM;
  }

  // Non-interactive fallbacks & validation
  if (!appName) {
    console.error('Error: missing <app-name>\n');
    printHelp();
    process.exit(1);
  }
  if (!template) template = DEFAULT_TEMPLATE;
  if (!TEMPLATES.has(template)) {
    console.error(
      `Error: invalid template "${template}". Valid: ${Array.from(TEMPLATES).join(', ')}`
    );
    process.exit(1);
  }
  if (!pkgMgr) pkgMgr = DEFAULT_PM;

  const cwd = process.cwd();
  const dest = path.resolve(cwd, appName);

  await ensureEmptyDir(dest);

  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const tplRoot = path.resolve(__dirname, '..', 'templates', template);

  await copyTemplate(tplRoot, dest);
  await patchPkgJson(dest, appName);
  await writeGitignore(dest);

  // Ensure src-api exists (safety for tests & empty templates)
  await fs.mkdir(path.join(dest, 'src-api'), { recursive: true });

  console.log(`\nScaffolded ${appName} with "${template}" template.\n`);

  if (doInstall) {
    console.log(`Installing dependencies with ${pkgMgr}...`);
    const code = await run(pmInstallCommand(pkgMgr), { cwd: dest });
    if (code !== 0) {
      console.warn(`⚠️  ${pkgMgr} install failed (exit ${code}). You can run it manually later.`);
    }
  } else {
    console.log('Skipping install (use --no-install).');
  }

  console.log('\nNext steps:');
  console.log(`  cd ${appName}`);
  if (!doInstall) console.log(`  ${pkgMgr} install`);
  console.log('  ' + scriptHint(pkgMgr, 'dev') + '     # watch & rebuild (use with preview)');
  console.log('  ' + scriptHint(pkgMgr, 'preview') + ' # open the preview UI at /_ui\n');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--help' || t === '-h') out.help = true;
    else if (t === '--yes' || t === '-y') out.yes = true;
    else if (t === '--no-install') out['no-install'] = true;
    else if (t === '--template') out.template = argv[++i];
    else if (t === '--package-manager') out['package-manager'] = argv[++i];
    else if (t.startsWith('--template=')) out.template = t.split('=', 2)[1];
    else if (t.startsWith('--package-manager=')) out['package-manager'] = t.split('=', 2)[1];
    else if (!t.startsWith('-')) out._.push(t);
  }
  return out;
}

function printHelp() {
  console.log(`create-statikapi — scaffold a StatikAPI project

Usage:
  create-statikapi <app-name> [--template basic|dynamic|remote-data] [--yes]
                   [--no-install] [--package-manager pnpm|npm|yarn]

Options:
  --template           Which template to use (default: ${DEFAULT_TEMPLATE})
  --yes, -y            Accept defaults (skip interactive prompts)
  --no-install         Do not run the package manager install step
  --package-manager    pnpm | npm | yarn (default: ${DEFAULT_PM})
  --help, -h           Show this help

Examples:
  create-statikapi my-api
  create-statikapi my-api --template dynamic --no-install
  create-statikapi my-api --package-manager npm
`);
}

async function ensureEmptyDir(dest) {
  try {
    await fs.mkdir(dest, { recursive: true });
    const ent = await fs.readdir(dest);
    if (ent.length > 0) {
      console.error(`Error: destination directory is not empty: ${dest}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: cannot prepare directory: ${e.message}`);
    process.exit(1);
  }
}

async function copyTemplate(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const items = await fs.readdir(src, { withFileTypes: true });
  for (const it of items) {
    const s = path.join(src, it.name);
    const d = path.join(dst, it.name);
    if (it.isDirectory()) await copyTemplate(s, d);
    else if (it.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function patchPkgJson(dest, appName) {
  const p = path.join(dest, 'package.json');
  const raw = await fs.readFile(p, 'utf8');
  const json = JSON.parse(raw);
  json.name = appName;
  // Ensure dev scripts and devDependency on statikapi
  json.type = json.type || 'module';
  json.scripts = {
    dev: 'statikapi dev',
    build: 'statikapi build --pretty',
    preview: 'statikapi preview --open',
  };
  // keep your current CLI version constraint
  json.devDependencies = { ...(json.devDependencies || {}), statikapi: '^0.1.1' };
  await fs.writeFile(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

async function writeGitignore(dest) {
  const p = path.join(dest, '.gitignore');
  if (fss.existsSync(p)) return;
  const txt = `node_modules
api-out
dist
.tmp
coverage
.DS_Store
`;
  await fs.writeFile(p, txt, 'utf8');
}

function pmInstallCommand(pm) {
  if (pm === 'npm') return ['npm', ['install']];
  if (pm === 'yarn') return ['yarn', []];
  return ['pnpm', ['install']]; // default
}

function scriptHint(pm, script) {
  if (pm === 'npm') return `npm run ${script}`;
  if (pm === 'yarn') return `yarn ${script}`;
  return `pnpm ${script}`;
}

function run([cmd, args], opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { ...opts, stdio: 'inherit' }, (err) => {
      resolve(err ? (err.code ?? 1) : 0);
    });
  });
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});
