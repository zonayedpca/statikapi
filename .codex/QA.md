# QA

This file is the release QA board for StatikAPI.

Use these statuses:

- `🟦 QA Ready`: the task is defined and can be tested now
- `🟨 QA In Progress`: someone is actively testing it
- `❌ Not Passed`: the task was tested and failed; it needs a fix before retest
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

| ID       | Area       | Task                                                                                                                          | Status      | Verification                                                                                                                                   |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-0001  | Repo       | Install dependencies in a clean working tree with `pnpm install`                                                              | ✅ Done     | `pnpm install` passed locally                                                                                                                  |
| QA-0002  | Repo       | Run lint with `pnpm -w lint`                                                                                                  | ✅ Done     | `pnpm -w lint` passed locally                                                                                                                  |
| QA-0003  | Repo       | Run format check with `pnpm -w format`                                                                                        | ✅ Done     | `pnpm -w format` passed locally                                                                                                                |
| QA-0004  | Repo       | Run automated tests with `pnpm -w test`                                                                                       | ✅ Done     | `pnpm -w test` passed locally                                                                                                                  |
| QA-0005  | UI         | Build embedded UI with `pnpm ui:build`                                                                                        | ✅ Done     | `pnpm ui:build` passed and embedded UI assets are present                                                                                      |
| QA-0006  | CLI        | Verify `statikapi --help` and `statikapi --version` work                                                                      | ✅ Done     | both commands exit `0`, `build`/`dev` are listed, and the `Commands:` section is clean                                                         |
| QA-0007  | CLI        | Verify local build flow in `example/basic`                                                                                    | ✅ Done     | `pnpm -C example/basic build` passed and emitted expected output                                                                               |
| QA-0008  | CLI        | Verify local dev preview in `example/basic`                                                                                   | ✅ Done     | `example/basic` dev preview served and loaded correctly locally                                                                                |
| QA-0009  | CLI        | Verify dynamic and catch-all routes in `example/dynamic`                                                                      | ✅ Done     | `example/dynamic` build passed and emitted expected dynamic/catch-all outputs                                                                  |
| QA-0010  | CLI        | Verify collection index output in local CLI path                                                                              | ✅ Done     | local `config.listIndex` verification passed, including derived parent collection routes                                                       |
| QA-0011  | CLI        | Verify preview UI route browsing and JSON rendering                                                                           | ✅ Done     | local preview UI verification passed, including route browsing and JSON rendering                                                              |
| QA-0012  | Scaffolder | Scaffold a normal app with `node packages/create-statikapi/bin/create-statikapi.js ... --template basic --no-install`         | ✅ Done     | basic scaffolder verification passed and expected files were created                                                                           |
| QA-0013  | Scaffolder | Scaffold a dynamic app with `--template dynamic --no-install`                                                                 | ✅ Done     | dynamic scaffolder verification passed and example routes were created                                                                         |
| QA-0014  | Scaffolder | Scaffold a Cloudflare app with `--template cloudflare-adapter --no-install`                                                   | ✅ Done     | `wrangler.toml`, `.dev.vars.example`, `statikapi.config.js`, and preview script exist for the single Worker + Static Assets model              |
| QA-0014A | Scaffolder | Verify Cloudflare scaffold creates `.dev.vars` directly and docs explain how local and deploy-time variables must be set      | ✅ Done     | scaffold writes `.dev.vars` without a rename step, and docs clearly explain local use plus deploy-time Worker variable setup                   |
| QA-0015  | Cloudflare | Verify Worker bundle build with `pnpm -C example/cloudflare build`                                                            | ✅ Done     | `example/cloudflare/dist/worker.mjs` exists                                                                                                    |
| QA-0016  | Cloudflare | Verify local Worker runtime with `pnpm -C example/cloudflare wrangler:dev -- --port 8787`                                     | ✅ Done     | local Worker serves split manifests, `POST /` full rebuilds, and private routes while public manifest lives at `/public/_manifest`             |
| QA-0017  | Cloudflare | Verify local preview proxy with `statikapi-cf preview --worker http://127.0.0.1:8787 --port 8788`                             | ✅ Done     | `http://127.0.0.1:8788/_ui/` loads and reads public/private manifest data correctly                                                            |
| QA-0017A | Cloudflare | Verify default Cloudflare `dev` opens the preview UI flow end to end                                                          | ✅ Done     | `pnpm dev`/`npm run dev`/`yarn dev` start Worker + preview together and the UI is reachable                                                    |
| QA-0018  | Cloudflare | Verify public-by-default route behavior                                                                                       | ✅ Done     | routes without `config.cloudflare.public = false` are emitted under `/public/...` and preview correctly                                        |
| QA-0019  | Cloudflare | Verify private routes in preview using `.dev.vars` auth injection                                                             | ✅ Done     | private routes load in preview without manual browser headers                                                                                  |
| QA-0020  | Cloudflare | Verify Cloudflare `listIndex` outputs                                                                                         | ✅ Done     | collection/index routes appear in manifest and load correctly                                                                                  |
| QA-0021  | Cloudflare | Verify targeted private rebuilds and public-route rejection                                                                   | ✅ Done     | private `POST <route-path>` updates Worker-managed output, while public-route `POST` requests are rejected                                     |
| QA-0022  | Cloudflare | Verify Worker + Static Assets contract locally                                                                                | ✅ Done     | public routes and `/public/_manifest` are exposed from Static Assets while private routes and `/_manifest` stay behind the Worker              |
| QA-0026  | Cloudflare | Verify preview JSON rendering for Cloudflare routes                                                                           | ✅ Done     | preview loads valid JSON for both public and private routes and the JSON panel parses both correctly                                           |
| QA-0027  | Cloudflare | Verify Cloudflare `dev` reflects route-content edits in both Worker responses and preview UI without requiring a cold restart | ✅ Done     | editing an existing route file updates the Worker payload and preview UI during `dev`, or at worst after a normal rebuild cycle                |
| QA-0028  | Cloudflare | Verify preview groups Cloudflare routes by public vs private visibility                                                       | ✅ Done     | public and private routes are clearly separated in the UI so users can immediately tell which surface they are inspecting                      |
| QA-0029  | Cloudflare | Verify Cloudflare Absolute URL and code snippets respect route-shape preferences and private-route auth needs                 | ✅ Done     | snippets use the Worker origin, match actual emitted path shapes, and mention the required auth header for private routes                      |
| QA-0023  | Cloudflare | Verify route-level opt-out from public-by-default behavior                                                                    | ✅ Done     | routes marked private are not treated as public Static Assets and require Worker auth                                                          |
| QA-0030  | Cloudflare | Verify routes with `config.cloudflare.webhook = false` still appear in local preview UI and remain readable there             | ✅ Done     | webhook-disabled routes appear in the preview route list and load correctly in the UI even though webhook rebuilds stay disabled               |
| QA-0031  | Cloudflare | Verify `STATIK_USE_INDEX_JSON = false` emits extensionless Cloudflare route/object paths instead of `.json` suffixes          | ✅ Done     | non-root Cloudflare outputs and manifest/file references use extensionless paths like `posts` rather than `posts.json`                         |
| QA-0032  | Cloudflare | Verify Cloudflare scaffold keeps auth/build variables in one canonical config location instead of duplicating them            | ✅ Done     | `STATIK_BUILD_TOKEN`, private auth header name, and private auth header value appear in one place only and the project behavior is unambiguous |
| QA-0033  | Cloudflare | Verify Cloudflare `dev` stays idle without repeated rebuild churn when no source files changed                                | ✅ Done     | preview/build traffic settles into a stable idle state; no repeated `POST /_preview/build` loop or route-output churn occurs without edits     |
| QA-0034  | Cloudflare | Verify Cloudflare deploy flow rebuilds public assets when needed, documents deployed secrets clearly, and makes private outputs available after deployment | 🟦 QA Ready | deploy behavior is explicit and reliable: public outputs are fresh, required deployed secrets are documented, and private routes can be seeded after deploy without failing the deploy when seeding is unavailable |
| QA-0024  | Docs       | Check root README, scaffold README, and Cloudflare instructions against actual commands                                       | 🟦 QA Ready | no obvious command drift remains                                                                                                               |
| QA-0025  | Publish    | Confirm package contents before release                                                                                       | ✅ Done     | `statikapi`, `create-statikapi`, and `@statikapi/adapter-cf` include expected runtime assets                                                   |

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
- help output has a clean `Commands:` section
- help output does not include unrelated scaffolder text such as `Scaffold a new StatikAPI project`

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

#### QA-0014A

Status: `✅ Done`

Command:

```bash
node packages/create-statikapi/bin/create-statikapi.js example/qa-cloudflare-env --template cloudflare-adapter --no-install
```

Pass when:

- `.dev.vars` exists directly in the scaffolded project
- `.dev.vars.example` is not required as a manual rename step for the default local flow
- the scaffold README and Cloudflare docs explain which variables belong in local `.dev.vars`
- the scaffold README and Cloudflare docs explain how required deploy-time Worker variables should be set in Cloudflare for deployed environments

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

Status: `✅ Done`

Pass when:

- the Absolute URL uses the Worker origin, not the preview UI origin
- the Absolute URL matches the actual emitted route shape for the current project settings
- snippet examples respect path-shape preferences such as no `.json` suffixes or no `/index` paths when that is the configured runtime surface
- the route details page shows correct Absolute URL, `curl`, browser `fetch`, and Node `fetch` examples for both public and private routes
- private-route snippets make the required auth header obvious in curl/browser/node examples

#### QA-0023

Status: `✅ Done`

Pass when:

- routes marked private via route config are not treated as public
- those private routes are served through the Worker path only
- private route reads without auth fail as expected

#### QA-0030

Status: `✅ Done`

Pass when:

- a Cloudflare route with `config.cloudflare.webhook = false` still appears in the local preview route list
- selecting that route in preview loads valid JSON in `Tree`, `Pretty`, and `Raw`
- the route remains readable in preview even though webhook-triggered rebuild access for that route stays disabled
- the route still builds correctly in normal build output

#### QA-0031

Status: `✅ Done`

Setup:

- use a Cloudflare project with `STATIK_USE_INDEX_JSON = false`

Pass when:

- a non-root public route such as `/posts` is exposed and referenced with an extensionless path like `public/posts`, not `public/posts.json`
- the backing public Static Asset may use a collision-safe hidden `index` file such as `public/posts/index` when needed to coexist with child routes
- a non-root private route such as `/posts/1` is emitted with an extensionless object key like `posts/1`, not `posts/1.json`
- any manifest entries or preview metadata that expose file paths reflect the extensionless shape consistently
- the actual readable route surface still matches the configured Cloudflare path shape

#### QA-0032

Status: `✅ Done`

Pass when:

- in a newly scaffolded Cloudflare project, `STATIK_BUILD_TOKEN` is defined in only one canonical location
- in a newly scaffolded Cloudflare project, `STATIK_PRIVATE_AUTH_HEADER_NAME` is defined in only one canonical location
- in a newly scaffolded Cloudflare project, `STATIK_PRIVATE_AUTH_HEADER_VALUE` is defined in only one canonical location
- the chosen location is documented clearly enough that a user can tell where to edit these values without guessing about precedence
- local preview, private-route reads, and webhook auth still work with the non-duplicated configuration

#### QA-0033

Status: `✅ Done`

Setup:

- run the scaffolded Cloudflare project with the normal local `dev` flow
- do not edit any source route files after startup

Pass when:

- after the initial startup/build settles, the local dev loop reaches an idle state instead of continuing to trigger rebuild traffic
- repeated `POST /_preview/build` requests do not continue firing indefinitely without a source change
- repeated `GET /public/_manifest` and `GET /_manifest` polling does not cause route outputs to rebuild or mutate on its own
- previewed route content remains stable over time when no source files changed
- the resulting behavior is back to the deliberate, consistent refresh pattern expected from the earlier `1.0.0-rc.1` dev experience

### 5. Docs and Publish Checks

#### QA-0024

Status: `🟦 QA Ready`

Check:

- [README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/README.md)
- [packages/create-statikapi/templates/cloudflare-adapter/README.md](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/packages/create-statikapi/templates/cloudflare-adapter/README.md)
- [docs/serverless/cloudflare-adapter.mdx](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/docs/serverless/cloudflare-adapter.mdx)
- [docs/deployments/cloudflare.mdx](/Users/zonayedpca/Desktop/Workspace/statapi/statikapi/docs/deployments/cloudflare.mdx)

Pass when:

- commands and current behavior match docs
- Cloudflare docs clearly describe:
  - which services are used
  - free-tier limits at a high level
  - what starts charging after free usage
  - custom-domain setup
  - scaffold deployment steps

#### QA-0025

Status: `✅ Done`

Suggested checks:

```bash
npm pack --dry-run --prefix packages/cli
npm pack --dry-run --prefix packages/create-statikapi
npm pack --dry-run --prefix packages/adapter-cloudflare
```

Pass when:

- CLI package includes embedded UI
- Cloudflare adapter package includes preview runtime and `ui/`
- scaffolder package includes current templates

#### QA-0034

Status: `🟦 QA Ready`

Setup:

- use a scaffolded Cloudflare project
- start from a state where at least one public route and one private route have changed since the last deploy

Pass when:

- the documented deploy command or script makes it clear whether a build runs automatically before deployment
- if build-before-deploy is part of the contract, changed public outputs are actually rebuilt and present after deployment without requiring a separate manual build
- the deploy command does not fail if the optional private-output seed step cannot run after `wrangler deploy`
- docs clearly explain that local `.dev.vars` values do not automatically become deployed Worker secrets
- docs clearly explain how to set required deployed secrets, either via Wrangler commands or the Cloudflare dashboard
- the deploy flow clearly explains how private route outputs become available after deployment
- if private routes require an explicit post-deploy build or seed step, that step is documented and works as written

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
