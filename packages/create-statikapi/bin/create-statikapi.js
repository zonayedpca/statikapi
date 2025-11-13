#!/usr/bin/env node
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const TEMPLATES = new Set(['basic', 'dynamic', 'remote-data', 'cloudflare-adapter']);
const DEFAULT_TEMPLATE = 'basic';
const DEFAULT_PM = 'pnpm';
const DEFAULT_SRC = 'src-api';
const DEFAULT_OUT = 'api-out';

// deploy targets (for non-cloudflare templates)
const DEPLOY_TARGETS = [
  { title: 'Cloudflare Workers (wrangler.toml)', value: 'cloudflare' },
  { title: 'Netlify (netlify.toml)', value: 'netlify' },
  { title: 'GitHub Pages (actions workflow)', value: 'github' },
];

async function main(argv) {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const interactive = process.stdout.isTTY && !args.yes;

  // seeds from flags/positionals
  let appName = args._[0] || null;
  let template = (args.template || '').toLowerCase();
  let pkgMgr = String(args['package-manager'] || '');
  const doInstall = !args['no-install'];

  let wantEslint = true;
  let language = 'js'; // default JavaScript

  // generic flags
  let srcDir = args['src-dir'] || '';
  let outDir = args['out-dir'] || '';
  let wantGitignore = args['no-gitignore'] ? false : true; // default: true

  // deploy flags (non-cloudflare templates)
  let deploy = normalizeDeployArg(args.deploy);

  // Cloudflare adapter specific config (with placeholder defaults)
  let r2Binding = 'STATIK_BUCKET';
  let r2BucketName = 'REPLACE_ME_BUCKET';
  let kvBinding = 'STATIK_MANIFEST';
  let kvId = 'REPLACE_ME_KV_NAMESPACE_ID';
  let buildToken = 'REPLACE_ME_STATIK_BUILD_TOKEN';
  let statikSrcVar = ''; // defaults to srcDir later
  let statikUseIndexJson = 'false'; // default false as requested

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
                { title: 'cloudflare-adapter (Worker + R2 + KV)', value: 'cloudflare-adapter' },
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
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'confirm';
          },
          name: 'wantEslint',
          message: 'Add ESLint?',
          initial: true,
        },
        // language: hidden for cloudflare-adapter (JS only)
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'select';
          },
          name: 'language',
          message: 'Language',
          choices: [
            { title: 'JavaScript', value: 'js' },
            { title: 'TypeScript', value: 'ts' },
          ],
          initial: 0,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'text';
          },
          name: 'srcDir',
          message: 'Source directory for endpoints',
          initial: srcDir || DEFAULT_SRC,
        },
        // outDir: not asked for cloudflare-adapter
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'text';
          },
          name: 'outDir',
          message: 'Output directory for built JSON',
          initial: outDir || DEFAULT_OUT,
        },

        // Cloudflare adapter–specific prompts
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'r2Binding',
          message: 'R2 bucket binding name ([[r2_buckets]].binding)',
          initial: r2Binding,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'r2BucketName',
          message: 'R2 bucket_name',
          initial: r2BucketName,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'kvBinding',
          message: 'KV namespace binding ([[kv_namespaces]].binding)',
          initial: kvBinding,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'kvId',
          message: 'KV namespace id',
          initial: kvId,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'buildToken',
          message: 'STATIK_BUILD_TOKEN (used to auth /build)',
          initial: buildToken,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'text' : null;
          },
          name: 'statikSrc',
          message: 'STATIK_SRC (source dir for worker; usually matches srcDir)',
          initial: (answers) => answers.srcDir || srcDir || DEFAULT_SRC,
        },
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? 'toggle' : null;
          },
          name: 'statikUseIndexJson',
          message: 'STATIK_USE_INDEX_JSON?',
          active: 'true',
          inactive: 'false',
          initial: 0, // default false
        },

        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'toggle';
          },
          name: 'gitignore',
          message: 'Add .gitignore?',
          active: 'yes',
          inactive: 'no',
          initial: wantGitignore ? 1 : 0,
        },
        // "Where do you plan to deploy?" — disabled for cloudflare-adapter
        {
          type: (prev, values) => {
            const tmpl = TEMPLATES.has(template) ? template : values.template;
            return tmpl === 'cloudflare-adapter' ? null : 'multiselect';
          },
          name: 'deploy',
          message: 'Where do you plan to deploy? (creates config files)',
          instructions: false,
          choices: DEPLOY_TARGETS.map((c) => ({ title: c.title, value: c.value })),
          hint: 'Space to select, Enter to submit',
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

    // For cloudflare-adapter, always disable ESLint
    if (template === 'cloudflare-adapter') {
      wantEslint = false;
    } else {
      wantEslint = answers.wantEslint ?? true;
    }
    // language: if cloudflare-adapter, force JS
    language = template === 'cloudflare-adapter' ? 'js' : answers.language || language || 'js';

    srcDir = answers.srcDir || DEFAULT_SRC;
    outDir = template === 'cloudflare-adapter' ? DEFAULT_OUT : answers.outDir || DEFAULT_OUT;
    wantGitignore = !!answers.gitignore;

    if (template === 'cloudflare-adapter') {
      r2Binding = answers.r2Binding || r2Binding;
      r2BucketName = answers.r2BucketName || r2BucketName;
      kvBinding = answers.kvBinding || kvBinding;
      kvId = answers.kvId || kvId;
      buildToken = answers.buildToken || buildToken;
      statikSrcVar = answers.statikSrc || srcDir || DEFAULT_SRC;
      statikUseIndexJson =
        typeof answers.statikUseIndexJson === 'string'
          ? answers.statikUseIndexJson
          : String(answers.statikUseIndexJson ?? false);
      deploy = []; // never used for this template
    } else {
      deploy = deploy.length ? deploy : answers.deploy || [];
    }
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
  if (!srcDir) srcDir = DEFAULT_SRC;
  if (!outDir) outDir = DEFAULT_OUT;

  const cwd = process.cwd();
  const dest = path.resolve(cwd, appName);
  await ensureEmptyDir(dest);

  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const tplRoot = path.resolve(__dirname, '..', 'templates', template);

  await copyTemplate(tplRoot, dest);

  // Patch package.json (name, scripts, devDeps)
  await patchPkgJson(dest, appName, { pkgMgr, template, srcDir });

  await writeNodeVersions(dest);

  if (wantEslint && template !== 'cloudflare-adapter') {
    await writeEslint(dest, { language });
  }

  // Ensure src dir exists; if template has src-api and user changed the name, move it.
  await ensureSrcDir(dest, srcDir);

  // If the user chose TypeScript (non-cloudflare), convert example endpoints to .ts
  if (language === 'ts' && template !== 'cloudflare-adapter') {
    await convertExampleEndpointsToTS(dest, srcDir);
  }

  // Write config if user deviated from defaults (non-cloudflare only)
  if (template !== 'cloudflare-adapter' && (srcDir !== DEFAULT_SRC || outDir !== DEFAULT_OUT)) {
    await writeStatikConfig(dest, { srcDir, outDir });
  }

  // Cloudflare wrangler.toml patching for adapter template
  if (template === 'cloudflare-adapter') {
    await patchCloudflareWrangler(dest, {
      srcDir,
      r2Binding,
      r2BucketName,
      kvBinding,
      kvId,
      buildToken,
      statikSrc: statikSrcVar || srcDir || DEFAULT_SRC,
      statikUseIndexJson,
    });
  }

  // .gitignore (optional, default yes)
  if (wantGitignore) {
    await writeGitignore(dest, { outDir, template });
  }

  // Deployment configs (non-cloudflare templates only)
  if (template !== 'cloudflare-adapter' && deploy.length) {
    await writeDeployConfigs(dest, { outDir, appName, deploy, pkgMgr });
  }

  console.log(`\nScaffolded ${appName} with "${template}" template.`);
  console.log(`- srcDir: ${srcDir}`);
  console.log(`- .gitignore: ${wantGitignore ? 'yes' : 'no'}`);

  if (template === 'cloudflare-adapter') {
    console.log(`- Cloudflare R2 binding: ${r2Binding}`);
    console.log(`- R2 bucket_name: ${r2BucketName}`);
    console.log(`- KV binding: ${kvBinding}`);
    console.log(`- KV id: ${kvId}`);
    console.log(`- STATIK_SRC: ${statikSrcVar || srcDir}`);
    console.log(`- STATIK_USE_INDEX_JSON: ${statikUseIndexJson}\n`);
  } else {
    console.log(`- outDir: ${outDir}`);
    console.log(`- deploy: ${deploy.length ? deploy.join(', ') : 'none'}\n`);
  }

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

  if (template === 'cloudflare-adapter') {
    console.log(
      '  ' + scriptHint(pkgMgr, 'dev') + '     # start Cloudflare dev (statikapi-cf + wrangler)'
    );
    console.log('  ' + scriptHint(pkgMgr, 'build') + '   # bundle worker to dist/worker.mjs\n');
    console.log('Then:');
    console.log('  - Inspect wrangler.toml (bindings, bucket, KV, STATIK_*)');
    console.log('  - Configure R2 bucket & KV namespace in Cloudflare dashboard\n');
  } else {
    console.log('  ' + scriptHint(pkgMgr, 'dev') + '     # run dev server with UI');
    console.log(
      '  ' + scriptHint(pkgMgr, 'build') + '   # emit static JSON into ' + outDir + '/\n'
    );
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--help' || t === '-h') out.help = true;
    else if (t === '--yes' || t === '-y') out.yes = true;
    else if (t === '--no-install') out['no-install'] = true;
    else if (t === '--no-gitignore') out['no-gitignore'] = true;
    else if (t === '--template') out.template = argv[++i];
    else if (t === '--package-manager') out['package-manager'] = argv[++i];
    else if (t === '--src-dir') out['src-dir'] = argv[++i];
    else if (t === '--out-dir') out['out-dir'] = argv[++i];
    else if (t === '--deploy')
      out.deploy = argv[++i]; // e.g. cloudflare,netlify
    else if (t.startsWith('--template=')) out.template = t.split('=', 2)[1];
    else if (t.startsWith('--package-manager=')) out['package-manager'] = t.split('=', 2)[1];
    else if (t.startsWith('--src-dir=')) out['src-dir'] = t.split('=', 2)[1];
    else if (t.startsWith('--out-dir=')) out['out-dir'] = t.split('=', 2)[1];
    else if (t.startsWith('--deploy=')) out.deploy = t.split('=', 2)[1];
    else if (!t.startsWith('-')) out._.push(t);
  }
  return out;
}

function normalizeDeployArg(arg) {
  if (!arg) return [];
  if (Array.isArray(arg)) return arg;
  return String(arg)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((x) => ['cloudflare', 'netlify', 'github'].includes(x));
}

function printHelp() {
  console.log(`create-statikapi — scaffold a StatikAPI project

Usage:
  create-statikapi <app-name>
    [--template basic|dynamic|remote-data|cloudflare-adapter]
    [--yes] [--no-install] [--no-gitignore]
    [--package-manager pnpm|npm|yarn]
    [--src-dir <dir>] [--out-dir <dir>]
    [--deploy cloudflare,netlify,github]

Options:
  --template           Which template to use (default: ${DEFAULT_TEMPLATE})
  --yes, -y            Accept defaults (skip interactive prompts)
  --no-install         Skip installing dependencies
  --no-gitignore       Do not create a .gitignore (default is to create one)
  --package-manager    pnpm | npm | yarn (default: ${DEFAULT_PM})
  --src-dir            Source directory for endpoints (default: ${DEFAULT_SRC})
  --out-dir            Output directory for built JSON (default: ${DEFAULT_OUT})
  --deploy             Comma-separated deployment targets: cloudflare, netlify, github
  --help, -h           Show this help

Examples:
  create-statikapi my-api
  create-statikapi my-api --template dynamic --no-install
  create-statikapi my-api --package-manager npm --src-dir api --out-dir out
  create-statikapi my-worker --template cloudflare-adapter
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

function pmVersionFromSelection(pm) {
  // Safe pinned defaults (adjust anytime)
  const defaults = {
    pnpm: '9.12.3',
    yarn: '1.22.22', // Yarn classic
    npm: '10.9.0',
  };
  return defaults[pm] || null;
}

async function patchPkgJson(dest, appName, { pkgMgr, template, srcDir }) {
  const p = path.join(dest, 'package.json');
  const raw = await fs.readFile(p, 'utf8');
  const json = JSON.parse(raw);

  json.name = appName;
  json.type = json.type || 'module';
  json.engines = { ...(json.engines || {}), node: '>=22' };

  const pmVer = pmVersionFromSelection(pkgMgr);
  if (pmVer) json.packageManager = `${pkgMgr}@${pmVer}`;

  // For cloudflare-adapter, keep template's scripts/devDeps and just tweak --src
  if (template === 'cloudflare-adapter') {
    const scripts = json.scripts || {};
    const buildScript = scripts.build || '';

    if (buildScript.includes('statikapi-cf')) {
      if (/--src\s+\S+/.test(buildScript)) {
        scripts.build = buildScript.replace(/--src\s+\S+/, `--src ${srcDir}`);
      } else {
        scripts.build = `${buildScript} --src ${srcDir}`;
      }
    }

    json.scripts = scripts;
    await fs.writeFile(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return;
  }

  // Default behavior for "normal" StatikAPI projects
  json.scripts = {
    dev: 'statikapi dev',
    build: 'statikapi build --pretty',
    'dev:headless': 'statikapi dev --no-ui',
    'build:api': 'statikapi build',
  };
  json.devDependencies = { ...(json.devDependencies || {}), statikapi: '^0.6.4' };

  await fs.writeFile(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

async function writeNodeVersions(dest) {
  await fs.writeFile(path.join(dest, '.nvmrc'), '22\n', 'utf8');
  await fs.writeFile(path.join(dest, '.node-version'), '22\n', 'utf8'); // asdf/Volta compatibility
}

async function writeEslint(dest, { language }) {
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));

  pkg.scripts = {
    ...(pkg.scripts || {}),
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
  };

  if (language === 'js') {
    pkg.devDependencies = {
      ...(pkg.devDependencies || {}),
      eslint: '^9.0.0',
      '@eslint/js': '^9.0.0',
    };

    const eslintFlat = `import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    ignores: ['${DEFAULT_OUT}', 'dist', 'node_modules'],
  },
];
`;
    await fs.writeFile(path.join(dest, 'eslint.config.mjs'), eslintFlat, 'utf8');
  } else {
    // TypeScript flavor (flat config)
    pkg.devDependencies = {
      ...(pkg.devDependencies || {}),
      eslint: '^9.0.0',
      '@eslint/js': '^9.0.0',
      typescript: '^5.6.0',
      '@typescript-eslint/parser': '^8.0.0',
      '@typescript-eslint/eslint-plugin': '^8.0.0',
      'typescript-eslint': '^8.0.0',
    };

    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        isolatedModules: true,
        allowJs: true,
        checkJs: false,
        noEmit: true,
      },
      include: ['src-api', '**/*.ts', '**/*.js', '**/*.mjs', '**/*.cjs'],
      exclude: [DEFAULT_OUT, 'node_modules'],
    };
    await fs.writeFile(
      path.join(dest, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2) + '\n',
      'utf8'
    );

    const eslintTs = `import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    ignores: ['${DEFAULT_OUT}', 'dist', 'node_modules'],
    rules: {},
  },
];
`;
    await fs.writeFile(path.join(dest, 'eslint.config.mjs'), eslintTs, 'utf8');
  }

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

async function ensureSrcDir(dest, srcDir) {
  const defaultSrc = path.join(dest, DEFAULT_SRC);
  const wantedSrc = path.join(dest, srcDir);
  if (srcDir === DEFAULT_SRC) {
    await fs.mkdir(wantedSrc, { recursive: true });
    return;
  }
  try {
    const st = await fs.stat(defaultSrc);
    if (st.isDirectory()) {
      await fs.mkdir(path.dirname(wantedSrc), { recursive: true });
      await fs.rename(defaultSrc, wantedSrc);
      return;
    }
  } catch {
    /* ignore */
  }
  await fs.mkdir(wantedSrc, { recursive: true });
}

async function convertExampleEndpointsToTS(dest, srcDir) {
  const root = path.join(dest, srcDir);

  // Given a relative file path under srcDir, infer { params: ... } type
  function inferParamsType(relPath) {
    // Collect all dynamic segments like [id], [slug], [...slug]
    const parts = relPath.split(path.sep);
    const dyn = [];
    for (const p of parts) {
      const m = [...p.matchAll(/\[(\.\.\.)?([^\]]+)\]/g)];
      for (const g of m) {
        const isCatchAll = !!g[1];
        const name = g[2];
        dyn.push({ name, isCatchAll });
      }
    }
    if (!dyn.length) return null;

    const fields = dyn
      .map(({ name, isCatchAll }) => `  ${name}: ${isCatchAll ? 'string[]' : 'string'};`)
      .join('\n');

    return `{\n${fields}\n}`;
  }

  // Annotate function data({ params }) with inferred type
  async function annotateParamsType(fileAbs, relPath) {
    const paramsType = inferParamsType(relPath);
    if (!paramsType) return; // nothing to do

    let code = await fs.readFile(fileAbs, 'utf8');

    // Only annotate when there is a data({ params }) signature
    // Matches: export [default] [async] function data({ params })
    const sigs = [
      /export\s+async\s+function\s+data\s*\(\s*\{\s*params\s*\}\s*\)/g,
      /export\s+function\s+data\s*\(\s*\{\s*params\s*\}\s*\)/g,
      /export\s+default\s+async\s+function\s+data\s*\(\s*\{\s*params\s*\}\s*\)/g,
      /export\s+default\s+function\s+data\s*\(\s*\{\s*params\s*\}\s*\)/g,
    ];

    let replaced = false;
    const withType = `({ params }: { params: ${paramsType} })`;

    for (const re of sigs) {
      if (re.test(code)) {
        code = code.replace(re, (m) => m.replace(/\(\s*\{\s*params\s*\}\s*\)/, withType));
        replaced = true;
      }
    }

    if (replaced) {
      await fs.writeFile(fileAbs, code, 'utf8');
    }
  }

  async function walk(dir, relBase = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.join(relBase, e.name);
      if (e.isDirectory()) {
        await walk(abs, rel);
      } else if (e.isFile()) {
        // If JS file, annotate then rename to .ts
        if (abs.endsWith('.js')) {
          await annotateParamsType(abs, rel);
          const to = abs.slice(0, -3) + '.ts';
          await fs.rename(abs, to);
        }
      }
    }
  }

  try {
    await walk(root);
  } catch {
    // Non-fatal: srcDir may be empty, or already converted
  }
}

async function writeStatikConfig(dest, { srcDir, outDir }) {
  const cfgPath = path.join(dest, 'statikapi.config.js');
  const body = `export default {
  srcDir: ${JSON.stringify(srcDir)},
  outDir: ${JSON.stringify(outDir)},
};\n`;
  await fs.writeFile(cfgPath, body, 'utf8');
}

async function writeGitignore(dest, { outDir, template }) {
  const p = path.join(dest, '.gitignore');
  if (fss.existsSync(p)) return;

  let txt;
  if (template === 'cloudflare-adapter') {
    // Cloudflare Worker-oriented ignore
    txt = `
    # Node
    node_modules
    npm-debug.log*
    yarn-debug.log*
    yarn-error.log*
    pnpm-debug.log*
    package-lock.json
    yarn.lock
    pnpm-lock.yaml

    # Build artifacts
    dist
    .build
    .tmp
    coverage

    # Wrangler + Cloudflare
    .wrangler
    wrangler.log

    # Local env / secrets
    .env
    .env.*
    .dev.vars

    # OS / editor junk
    .DS_Store
    Thumbs.db
    .idea
    .vscode/*
    !.vscode/extensions.json
    !.vscode/settings.json
    `;
  } else {
    txt = `node_modules
${outDir}
dist
.tmp
coverage
.DS_Store
`;
  }
  await fs.writeFile(p, txt, 'utf8');
}

// Only used by non-cloudflare templates
async function writeDeployConfigs(dest, { outDir, appName, deploy, pkgMgr }) {
  if (deploy.includes('cloudflare')) {
    await writeWranglerToml(dest, { outDir, appName });
  }
  if (deploy.includes('netlify')) {
    await writeNetlifyToml(dest, { outDir, pkgMgr });
  }
  if (deploy.includes('github')) {
    await writeGithubPagesWorkflow(dest, { outDir, pkgMgr });
  }
}

// Static-asset-style wrangler helper (unchanged)
async function writeWranglerToml(dest, { outDir, appName }) {
  const p = path.join(dest, 'wrangler.toml');
  if (!fss.existsSync(p)) {
    const body = `name = "${sanitizeName(appName)}"
main = "worker.js" # not used for static assets, but required by some setups
compatibility_date = "${today()}"

[assets]
directory = "${outDir}"
# Optional: specify binding routes or headers via Workers config if needed
`;
    await fs.writeFile(p, body, 'utf8');
    // add a minimal worker stub only if missing
    const worker = path.join(dest, 'worker.js');
    if (!fss.existsSync(worker)) {
      await fs.writeFile(
        worker,
        `export default { fetch: () => new Response("StatikAPI on Cloudflare Workers") };`,
        'utf8'
      );
    }
  }
}

async function writeNetlifyToml(dest, { outDir, pkgMgr }) {
  const p = path.join(dest, 'netlify.toml');
  if (!fss.existsSync(p)) {
    const yarnEnv = pkgMgr === 'yarn' ? 'YARN_VERSION = "1"\n' : '';
    const body = `[build]
publish = "${outDir}"
# command = "pnpm build:api"

[build.environment]
NODE_VERSION = "22"
${yarnEnv}`;
    await fs.writeFile(p, body, 'utf8');
  }
}

async function writeGithubPagesWorkflow(dest, { outDir, pkgMgr }) {
  const dir = path.join(dest, '.github', 'workflows');
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, 'pages.yml');
  if (!fss.existsSync(p)) {
    const pmSetup =
      pkgMgr === 'pnpm'
        ? `- run: npm i -g pnpm@9
      - run: pnpm install --frozen-lockfile
      - run: pnpm build:api`
        : pkgMgr === 'yarn'
          ? `- run: npm i -g yarn@1
      - run: yarn install --frozen-lockfile
      - run: yarn build:api`
          : `- run: npm ci
      - run: npm run build:api`;

    const body = `name: Deploy (GitHub Pages)

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
${pmSetup.replace(/^/gm, '      ')}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${JSON.stringify(outDir)}
  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
    await fs.writeFile(p, body, 'utf8');
  }
}

// Cloudflare-adapter: patch wrangler.toml (template ships as wrangler.toml now)
async function patchCloudflareWrangler(
  dest,
  { srcDir, r2Binding, r2BucketName, kvBinding, kvId, buildToken, statikSrc, statikUseIndexJson }
) {
  const finalPath = path.join(dest, 'wrangler.toml');

  if (!fss.existsSync(finalPath)) {
    // nothing to patch, bail
    return;
  }

  let body = await fs.readFile(finalPath, 'utf8');

  body = body
    // R2 bucket
    .replace(/binding\s*=\s*"STATIK_BUCKET"/, `binding = "${r2Binding}"`)
    .replace(/bucket_name\s*=\s*"REPLACE_ME_BUCKET"/, `bucket_name = "${r2BucketName}"`)

    // KV namespace
    .replace(/binding\s*=\s*"STATIK_MANIFEST"/, `binding = "${kvBinding}"`)
    .replace(/id\s*=\s*"REPLACE_ME_KV_NAMESPACE_ID"/, `id = "${kvId}"`)

    // STATIK_* vars
    .replace(/STATIK_BUILD_TOKEN\s*=\s*".*"/, `STATIK_BUILD_TOKEN = "${buildToken}"`)
    .replace(/STATIK_SRC\s*=\s*".*"/, `STATIK_SRC = "${statikSrc}"`)
    .replace(/STATIK_USE_INDEX_JSON\s*=\s*".*"/, `STATIK_USE_INDEX_JSON = "${statikUseIndexJson}"`)

    // NEW: make STATIK_MANIFEST_BINDING follow whatever kvBinding the user chose
    .replace(/STATIK_MANIFEST_BINDING\s*=\s*".*"/, `STATIK_MANIFEST_BINDING = "${kvBinding}"`);

  await fs.writeFile(finalPath, body, 'utf8');
}

function sanitizeName(s) {
  return String(s || 'statikapi-app').replace(/[^a-z0-9-_]/gi, '-');
}

function today() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
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
