# QA

This file is the release QA board for StatikAPI.

Use these statuses:

- `🟦 QA Ready`: the task is defined and can be tested now
- `🟨 QA In Progress`: someone is actively testing it
- `✅ Done`: the task has been tested and passed

Do not publish until every required task in this file is `✅ Done`.

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

| ID       | Area       | Task                                                                                                                  | Status      | Verification                                                                                                                       |
| -------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| QA-0001  | Repo       | Install dependencies in a clean working tree with `pnpm install`                                                      | ✅ Done     | `pnpm install` passed locally                                                                                                      |
| QA-0002  | Repo       | Run lint with `pnpm -w lint`                                                                                          | ✅ Done     | `pnpm -w lint` passed locally                                                                                                      |
| QA-0003  | Repo       | Run format check with `pnpm -w format`                                                                                | ✅ Done     | `pnpm -w format` passed locally                                                                                                    |
| QA-0004  | Repo       | Run automated tests with `pnpm -w test`                                                                               | ✅ Done     | `pnpm -w test` passed locally                                                                                                      |
| QA-0005  | UI         | Build embedded UI with `pnpm ui:build`                                                                                | ✅ Done     | `pnpm ui:build` passed and embedded UI assets are present                                                                          |
| QA-0006  | CLI        | Verify `statikapi --help` and `statikapi --version` work                                                              | ✅ Done     | help/version commands passed locally                                                                                               |
| QA-0007  | CLI        | Verify local build flow in `example/basic`                                                                            | ✅ Done     | `pnpm -C example/basic build` passed and emitted expected output                                                                   |
| QA-0008  | CLI        | Verify local dev preview in `example/basic`                                                                           | ✅ Done     | `example/basic` dev preview served and loaded correctly locally                                                                    |
| QA-0009  | CLI        | Verify dynamic and catch-all routes in `example/dynamic`                                                              | ✅ Done     | `example/dynamic` build passed and emitted expected dynamic/catch-all outputs                                                      |
| QA-0010  | CLI        | Verify collection index output in local CLI path                                                                      | ✅ Done     | local `config.listIndex` verification passed, including derived parent collection routes                                           |
| QA-0011  | CLI        | Verify preview UI route browsing and JSON rendering                                                                   | ✅ Done     | local preview UI verification passed, including route browsing and JSON rendering                                                  |
| QA-0012  | Scaffolder | Scaffold a normal app with `node packages/create-statikapi/bin/create-statikapi.js ... --template basic --no-install` | ✅ Done     | basic scaffolder verification passed and expected files were created                                                               |
| QA-0013  | Scaffolder | Scaffold a dynamic app with `--template dynamic --no-install`                                                         | ✅ Done     | dynamic scaffolder verification passed and example routes were created                                                             |
| QA-0014  | Scaffolder | Scaffold a Cloudflare app with `--template cloudflare-adapter --no-install`                                           | ✅ Done     | `wrangler.toml`, `.dev.vars.example`, `statikapi.config.js`, and preview script exist for the single Worker + Static Assets model  |
| QA-0015  | Cloudflare | Verify Worker bundle build with `pnpm -C example/cloudflare build`                                                    | ✅ Done     | `example/cloudflare/dist/worker.mjs` exists                                                                                        |
| QA-0016  | Cloudflare | Verify local Worker runtime with `pnpm -C example/cloudflare wrangler:dev -- --port 8787`                             | 🟦 QA Ready | local Worker serves split manifests, `POST /` full rebuilds, and private routes while public manifest lives at `/public/_manifest` |
| QA-0017  | Cloudflare | Verify local preview proxy with `statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788`                     | ✅ Done     | `http://127.0.0.1:8788/_ui/` loads and reads public/private manifest data correctly                                                |
| QA-0017A | Cloudflare | Verify default Cloudflare `dev` opens the preview UI flow end to end                                                  | ✅ Done     | `pnpm dev`/`npm run dev`/`yarn dev` start Worker + preview together and the UI is reachable                                        |
| QA-0018  | Cloudflare | Verify public-by-default route behavior                                                                               | ✅ Done     | routes without `config.cloudflare.public = false` are emitted under `/public/...` and preview correctly                            |
| QA-0019  | Cloudflare | Verify private routes in preview using `.dev.vars` auth injection                                                     | ✅ Done     | private routes load in preview without manual browser headers                                                                      |
| QA-0020  | Cloudflare | Verify Cloudflare `listIndex` outputs                                                                                 | ✅ Done     | collection/index routes appear in manifest and load correctly                                                                      |
| QA-0021  | Cloudflare | Verify targeted private rebuilds and public-route rejection                                                           | ✅ Done     | private `POST <route-path>` updates Worker-managed output, while public-route `POST` requests are rejected                         |
| QA-0022  | Cloudflare | Verify Worker + Static Assets contract locally                                                                        | ✅ Done     | public routes and `/public/_manifest` are exposed from Static Assets while private routes and `/_manifest` stay behind the Worker  |
| QA-0026  | Cloudflare | Verify preview JSON rendering for Cloudflare routes                                                                   | ✅ Done     | preview loads valid JSON for both public and private routes and the JSON panel parses both correctly                               |
| QA-0027  | Cloudflare | Verify Cloudflare `dev` reflects route-content edits in both Worker responses and preview UI without requiring a cold restart | ✅ Done     | editing an existing route file updates the Worker payload and preview UI during `dev`, or at worst after a normal rebuild cycle    |
| QA-0028  | Cloudflare | Verify preview groups Cloudflare routes by public vs private visibility                                               | ✅ Done     | public and private routes are clearly separated in the UI so users can immediately tell which surface they are inspecting          |
| QA-0029  | Cloudflare | Verify Cloudflare Absolute URL and code snippets respect route-shape preferences and private-route auth needs         | 🟦 QA Ready | snippets use the Worker origin, match actual emitted path shapes, and mention the required auth header for private routes          |
| QA-0023  | Cloudflare | Verify route-level opt-out from public-by-default behavior                                                            | 🟦 QA Ready | routes marked private are not treated as public Static Assets and require Worker auth                                              |
| QA-0024  | Docs       | Check root README, scaffold README, and Cloudflare instructions against actual commands                               | 🟦 QA Ready | no obvious command drift remains                                                                                                   |
| QA-0025  | Publish    | Confirm package contents before release                                                                               | 🟦 QA Ready | `statikapi`, `create-statikapi`, and `@statikapi/adapter-cf` include expected runtime assets                                       |

## Detailed Tasks

### 1. Repo Checks

#### QA-0001

Status: `✅ Done`

Command:

```bash
pnpm install
```

Pass when:

- install completes without dependency or workspace resolution failures

#### QA-0002

Status: `✅ Done`

Command:

```bash
pnpm -w lint
```

Pass when:

- ESLint exits `0`

#### QA-0003

Status: `✅ Done`

Command:

```bash
pnpm -w format
```

Pass when:

- Prettier check exits `0`

#### QA-0004

Status: `✅ Done`

Command:

```bash
pnpm -w test
```

Pass when:

- all package tests pass

### 2. Normal CLI

#### QA-0005

Status: `✅ Done`

Command:

```bash
pnpm ui:build
```

Pass when:

- [packages/cli/ui/index.html](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/packages/cli/ui/index.html) exists

#### QA-0006

Status: `✅ Done`

Commands:

```bash
node packages/cli/bin/statikapi.js --help
node packages/cli/bin/statikapi.js --version
```

Pass when:

- both commands exit `0`
- help lists `build` and `dev`

#### QA-0007

Status: `✅ Done`

Command:

```bash
pnpm -C example/basic build
```

Pass when:

- [example/basic/api-out/index.json](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/basic/api-out/index.json) is written
- [example/basic/api-out/.statikapi/manifest.json](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/basic/api-out/.statikapi/manifest.json) is written

#### QA-0008

Status: `✅ Done`

Command:

```bash
pnpm -C example/basic dev
```

Pass when:

- `http://127.0.0.1:8788/_ui/` loads
- route selection renders JSON

#### QA-0009

Status: `✅ Done`

Command:

```bash
pnpm -C example/dynamic build
```

Pass when:

- dynamic and catch-all outputs are emitted
- manifest includes those routes

#### QA-0010

Status: `✅ Done`

Suggested verification:

- use an example or temp route with `config.listIndex`
- run `statikapi build`

Pass when:

- parent collection route is emitted
- `pick` behavior matches expectations

#### QA-0011

Status: `✅ Done`

Pass when:

- UI route list matches manifest
- `Tree`, `Pretty`, and `Raw` tabs render correctly
- copied JSON matches route payload

### 3. Scaffolder

#### QA-0012

Status: `✅ Done`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-basic --template basic --no-install
```

Pass when:

- app directory is created
- `src-api/index.js`, `package.json`, and `README.md` exist

#### QA-0013

Status: `✅ Done`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-dynamic --template dynamic --no-install
```

Pass when:

- dynamic example files are created

#### QA-0014

Status: `✅ Done`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-cloudflare --template cloudflare-adapter --no-install
```

Pass when:

- `wrangler.toml` exists
- `.dev.vars.example` exists
- `package.json` contains `preview`
- `package.json` `dev` script includes preview process
- default scaffold uses `public` as the Static Assets directory
- `--assets-dir <dir>` rewrites the Static Assets directory consistently in scaffolded files
- scaffold does not depend on a separate serving-mode selection prompt or `r2-public` contract

### 4. Cloudflare Adapter

#### QA-0015

Status: `✅ Done`

Command:

```bash
pnpm -C example/cloudflare build
```

Pass when:

- [example/cloudflare/dist/worker.mjs](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/cloudflare/dist/worker.mjs) exists
- [example/cloudflare/public/public](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/example/cloudflare/public/public) contains generated public JSON assets
- generated public asset paths match the example's `STATIK_USE_INDEX_JSON` setting
- at least one emitted public asset can be opened locally and parsed as valid JSON

#### QA-0016

Status: `✅ Done`

Command:

```bash
pnpm -C example/cloudflare wrangler:dev -- --port 8787
```

Pass when:

- `GET /public/_manifest` responds locally as a public Static Asset
- `GET /public/_manifest` includes only public `/public/...` routes
- unauthenticated `GET /_manifest` is rejected
- authenticated `GET /_manifest` responds locally from the Worker
- `GET /_manifest` includes only private Worker-managed routes
- authorized `POST /` is available locally for full rebuilds
- a private route returns `403` without the configured auth header
- the same private route responds successfully through the Worker path with the configured auth header
- an authorized targeted private `POST <route-path>` succeeds locally and updates that private route's stored output
- `POST /` does not change already-built public Static Asset output by itself

#### QA-0017

Status: `✅ Done`

Command:

```bash
pnpm -C example/cloudflare exec statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788
```

Pass when:

- `http://127.0.0.1:8788/_ui/` loads

#### QA-0017A

Status: `✅ Done`

Commands:

```bash
pnpm dev
npm run dev
yarn dev
```

Pass when:

- the default Cloudflare `dev` flow starts the worker build/watch process, local Worker runtime, and preview UI together
- the preview UI becomes reachable without manually starting a separate preview command
- the dev flow attempts to open the preview UI automatically unless disabled
- editing a source route causes rebuilt output to appear in the preview UI

Note:

- `QA-0017A` only proves the baseline end-to-end `dev` flow starts and is reachable
- use `QA-0027` for the stricter requirement that route-content edits propagate correctly to Worker output and preview data

#### QA-0018

Status: `✅ Done`

Pass when:

- routes without `config.cloudflare.public = false` are treated as public by default
- those public route payloads load in preview UI under `/public/...`

#### QA-0019

Status: `✅ Done`

Setup:

- ensure `.dev.vars` contains private auth name/value

Pass when:

- private routes load in preview UI without manual browser header hacks

#### QA-0020

Status: `✅ Done`

Pass when:

- Cloudflare routes using `config.listIndex` emit collection/index outputs
- those derived routes appear in manifest
- public derived routes load from `/public/...`
- private derived routes load through the Worker path when auth is supplied

#### QA-0021

Status: `✅ Done`

Pass when:

- targeted rebuilds through route-path `POST` refresh private Worker-managed output
- public-route root-path `POST` requests return a rejection that instructs the user to rebuild and redeploy static assets
- rejected public targeted rebuilds do not remove or corrupt existing manifest/private-route data
- full `POST /` rebuilds do not imply a public Static Assets refresh; public updates still require a rebuild/redeploy step

#### QA-0022

Status: `✅ Done`

Pass when:

- public routes are reachable under `/public/...`
- private routes stay on original paths and require auth
- public routes are served directly from generated Static Assets without forcing the Worker to run first
- the same local deployment still serves `POST /` and `GET /_manifest` from the Worker
- the Cloudflare app does not rely on a separate `r2-public` mode

#### QA-0026

Status: `✅ Done`

Pass when:

- selecting a public route in preview loads valid JSON in `Tree`, `Pretty`, and `Raw`
- selecting a private route in preview loads valid JSON in `Tree`, `Pretty`, and `Raw`
- preview data loads from the correct upstream route content for both public and private Cloudflare entries

#### QA-0027

Status: `✅ Done`

Pass when:

- while `pnpm dev` is running, editing the contents of an existing route file changes the Worker-served output for that route
- the same edit becomes visible in the preview UI without needing a full reinstall or a cold restart of the project
- creating/deleting files is not the only change type that propagates; ordinary content edits must propagate too

#### QA-0028

Status: `✅ Done`

Pass when:

- the Cloudflare preview route list clearly distinguishes public routes from private routes
- a user can tell from the UI which routes are served from Static Assets and which remain Worker/private routes

#### QA-0029

Status: `🟦 QA Ready`

Pass when:

- the Absolute URL uses the Worker origin, not the preview UI origin
- the Absolute URL matches the actual emitted route shape for the current project settings
- snippet examples respect path-shape preferences such as no `.json` suffixes or no `/index` paths when that is the configured runtime surface
- the route details page shows correct Absolute URL, `curl`, browser `fetch`, and Node `fetch` examples for both public and private routes
- private-route snippets make the required auth header obvious in curl/browser/node examples

#### QA-0023

Status: `🟦 QA Ready`

Pass when:

- routes marked private via route config are not treated as public
- those private routes are served through the Worker path only
- private route reads without auth fail as expected

### 5. Docs and Publish Checks

#### QA-0024

Status: `🟦 QA Ready`

Check:

- [README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/README.md)
- [packages/create-statikapi/templates/cloudflare-adapter/README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/packages/create-statikapi/templates/cloudflare-adapter/README.md)
- [TODO.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/TODO.md)

Pass when:

- commands and current behavior match docs

#### QA-0025

Status: `🟦 QA Ready`

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
