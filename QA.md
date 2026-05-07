# QA

This file is the release QA board for StatikAPI.

Use these statuses:

- `QA Ready`: the task is defined and can be tested now
- `QA In Progress`: someone is actively testing it
- `Done`: the task has been tested and passed

Do not publish until every required task in this file is `Done`.

## Release Gate

Required before publish:

- `pnpm install`
- `pnpm -w lint`
- `pnpm -w format`
- `pnpm -w test`
- manual local verification for normal CLI flow
- manual local verification for `create-statikapi`
- manual local verification for Cloudflare adapter flow

## Status Board

| ID      | Area       | Task                                                                                                                  | Status   | Verification                                                                                 |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| QA-0001 | Repo       | Install dependencies in a clean working tree with `pnpm install`                                                      | Done     | `pnpm install` passed locally                                                                |
| QA-0002 | Repo       | Run lint with `pnpm -w lint`                                                                                          | Done     | `pnpm -w lint` passed locally                                                                |
| QA-0003 | Repo       | Run format check with `pnpm -w format`                                                                                | Done     | `pnpm -w format` passed locally                                                              |
| QA-0004 | Repo       | Run automated tests with `pnpm -w test`                                                                               | QA Ready | Command exits `0`                                                                            |
| QA-0005 | UI         | Build embedded UI with `pnpm ui:build`                                                                                | QA Ready | `packages/cli/ui/index.html` exists and assets are present                                   |
| QA-0006 | CLI        | Verify `statikapi --help` and `statikapi --version` work                                                              | QA Ready | Commands print expected output and exit `0`                                                  |
| QA-0007 | CLI        | Verify local build flow in `example/basic`                                                                            | QA Ready | `pnpm -C example/basic build` writes `api-out/index.json`                                    |
| QA-0008 | CLI        | Verify local dev preview in `example/basic`                                                                           | QA Ready | `pnpm -C example/basic dev` serves `http://127.0.0.1:8788/_ui/`                              |
| QA-0009 | CLI        | Verify dynamic and catch-all routes in `example/dynamic`                                                              | QA Ready | `pnpm -C example/dynamic build` writes expected dynamic outputs                              |
| QA-0010 | CLI        | Verify collection index output in local CLI path                                                                      | QA Ready | dynamic/catch-all routes with `config.listIndex` emit parent `index.json`                    |
| QA-0011 | CLI        | Verify preview UI route browsing and JSON rendering                                                                   | QA Ready | UI shows manifest routes and loads JSON successfully                                         |
| QA-0012 | Scaffolder | Scaffold a normal app with `node packages/create-statikapi/bin/create-statikapi.js ... --template basic --no-install` | QA Ready | expected files are created                                                                   |
| QA-0013 | Scaffolder | Scaffold a dynamic app with `--template dynamic --no-install`                                                         | QA Ready | `users/[id]` and `docs/[...slug]` examples are created                                       |
| QA-0014 | Scaffolder | Scaffold a Cloudflare app with `--template cloudflare-adapter --no-install`                                           | QA Ready | `wrangler.toml`, `.dev.vars.example`, `statikapi.config.js`, preview script exist            |
| QA-0015 | Cloudflare | Verify Worker bundle build with `pnpm -C example/cloudflare build`                                                    | QA Ready | `example/cloudflare/dist/worker.mjs` exists                                                  |
| QA-0016 | Cloudflare | Verify local Worker runtime with `pnpm -C example/cloudflare wrangler:dev -- --port 8787`                             | QA Ready | local Worker serves manifest and routes                                                      |
| QA-0017 | Cloudflare | Verify local preview proxy with `statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788`                     | QA Ready | `http://127.0.0.1:8788/_ui/` loads                                                           |
| QA-0018 | Cloudflare | Verify public routes in preview                                                                                       | QA Ready | public routes load through preview UI and direct local Worker                                |
| QA-0019 | Cloudflare | Verify private routes in preview using `.dev.vars` auth injection                                                     | QA Ready | private routes load in preview without manual browser headers                                |
| QA-0020 | Cloudflare | Verify Cloudflare `listIndex` outputs                                                                                 | QA Ready | collection/index routes appear in manifest and load correctly                                |
| QA-0021 | Cloudflare | Verify targeted rebuilds keep collection indexes in sync                                                              | QA Ready | `/build?route=...` updates both item and derived collection route                            |
| QA-0022 | Cloudflare | Verify `worker` serving mode locally                                                                                  | QA Ready | `/public/...` and private routes behave as documented                                        |
| QA-0023 | Cloudflare | Verify `r2-public` serving mode locally                                                                               | QA Ready | Worker does not serve public route reads while manifest/build still work                     |
| QA-0024 | Docs       | Check root README, scaffold README, and Cloudflare instructions against actual commands                               | QA Ready | no obvious command drift remains                                                             |
| QA-0025 | Publish    | Confirm package contents before release                                                                               | QA Ready | `statikapi`, `create-statikapi`, and `@statikapi/adapter-cf` include expected runtime assets |

## Detailed Tasks

### 1. Repo Checks

#### QA-0001

Status: `Done`

Command:

```bash
pnpm install
```

Pass when:

- install completes without dependency or workspace resolution failures

#### QA-0002

Status: `Done`

Command:

```bash
pnpm -w lint
```

Pass when:

- ESLint exits `0`

#### QA-0003

Status: `Done`

Command:

```bash
pnpm -w format
```

Pass when:

- Prettier check exits `0`

#### QA-0004

Status: `QA Ready`

Command:

```bash
pnpm -w test
```

Pass when:

- all package tests pass

### 2. Normal CLI

#### QA-0005

Status: `QA Ready`

Command:

```bash
pnpm ui:build
```

Pass when:

- [packages/cli/ui/index.html](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/packages/cli/ui/index.html) exists

#### QA-0006

Status: `QA Ready`

Commands:

```bash
node packages/cli/bin/statikapi.js --help
node packages/cli/bin/statikapi.js --version
```

Pass when:

- both commands exit `0`
- help lists `build` and `dev`

#### QA-0007

Status: `QA Ready`

Command:

```bash
pnpm -C example/basic build
```

Pass when:

- [example/basic/api-out/index.json](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/basic/api-out/index.json) is written
- [example/basic/api-out/.statikapi/manifest.json](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/basic/api-out/.statikapi/manifest.json) is written

#### QA-0008

Status: `QA Ready`

Command:

```bash
pnpm -C example/basic dev
```

Pass when:

- `http://127.0.0.1:8788/_ui/` loads
- route selection renders JSON

#### QA-0009

Status: `QA Ready`

Command:

```bash
pnpm -C example/dynamic build
```

Pass when:

- dynamic and catch-all outputs are emitted
- manifest includes those routes

#### QA-0010

Status: `QA Ready`

Suggested verification:

- use an example or temp route with `config.listIndex`
- run `statikapi build`

Pass when:

- parent collection route is emitted
- `pick` behavior matches expectations

#### QA-0011

Status: `QA Ready`

Pass when:

- UI route list matches manifest
- `Tree`, `Pretty`, and `Raw` tabs render correctly
- copied JSON matches route payload

### 3. Scaffolder

#### QA-0012

Status: `QA Ready`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-basic --template basic --no-install
```

Pass when:

- app directory is created
- `src-api/index.js`, `package.json`, and `README.md` exist

#### QA-0013

Status: `QA Ready`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-dynamic --template dynamic --no-install
```

Pass when:

- dynamic example files are created

#### QA-0014

Status: `QA Ready`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-cloudflare --template cloudflare-adapter --no-install
```

Pass when:

- `wrangler.toml` exists
- `.dev.vars.example` exists
- `package.json` contains `preview`
- `package.json` `dev` script includes preview process

### 4. Cloudflare Adapter

#### QA-0015

Status: `QA Ready`

Command:

```bash
pnpm -C example/cloudflare build
```

Pass when:

- [example/cloudflare/dist/worker.mjs](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/cloudflare/dist/worker.mjs) exists

#### QA-0016

Status: `QA Ready`

Command:

```bash
pnpm -C example/cloudflare wrangler:dev -- --port 8787
```

Pass when:

- `GET /manifest` responds locally
- at least one public route responds locally

#### QA-0017

Status: `QA Ready`

Command:

```bash
pnpm -C example/cloudflare exec statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788
```

Pass when:

- `http://127.0.0.1:8788/_ui/` loads

#### QA-0018

Status: `QA Ready`

Pass when:

- public route payloads load in preview UI
- public route payloads also load directly from local Worker in `worker` mode

#### QA-0019

Status: `QA Ready`

Setup:

- ensure `.dev.vars` contains private auth name/value

Pass when:

- private routes load in preview UI without manual browser header hacks

#### QA-0020

Status: `QA Ready`

Pass when:

- Cloudflare routes using `config.listIndex` emit collection/index outputs
- those derived routes appear in manifest
- those derived routes load in preview

#### QA-0021

Status: `QA Ready`

Pass when:

- targeted rebuilds through `/build?route=...` refresh both concrete route output and collection/index output

#### QA-0022

Status: `QA Ready`

Pass when:

- in `worker` mode, public routes are reachable under `/public/...`
- private routes stay on original paths and require auth

#### QA-0023

Status: `QA Ready`

Pass when:

- in `r2-public` mode, Worker preview/build still functions
- Worker does not serve `/public/...` route reads directly

### 5. Docs and Publish Checks

#### QA-0024

Status: `QA Ready`

Check:

- [README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/README.md)
- [packages/create-statikapi/templates/cloudflare-adapter/README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/packages/create-statikapi/templates/cloudflare-adapter/README.md)
- [TODO.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/TODO.md)

Pass when:

- commands and current behavior match docs

#### QA-0025

Status: `QA Ready`

Suggested checks:

```bash
pnpm -C packages/cli pack --dry-run
pnpm -C packages/create-statikapi pack --dry-run
pnpm -C packages/adapter-cloudflare pack --dry-run
```

Pass when:

- CLI package includes embedded UI
- Cloudflare adapter package includes preview runtime and `ui/`
- scaffolder package includes current templates

## Current Feature-Specific QA Focus

These items should be treated as higher priority before the next publish:

- `STK-0006`: Cloudflare `config.listIndex`
- `STK-0007`: Cloudflare local preview parity

Minimum focused regression run:

```bash
node --test packages/adapter-cloudflare/test/preview.test.js packages/adapter-cloudflare/test/runtime.test.js packages/create-statikapi/test/scaffold-cloudflare.test.js
```

Pass when:

- preview proxy test passes
- Cloudflare runtime test passes
- Cloudflare scaffold test passes
