# APP_NAME — Cloudflare Worker + Static Assets via StatikAPI

This project uses **@statikapi/adapter-cf** to:

- Discover your `src-api/` routes
- Bundle a Cloudflare Worker to `dist/worker.mjs`
- Treat **public** route output as public-by-default and expose it from the `/public` partition
- Write **private** route output into a private R2 bucket
- Store a manifest and runtime limit counters in KV
- Trigger rebuilds via authenticated `POST` webhooks on route paths

The generated manifest entries include:

- `srcRoute`
- `webhookAvailable`
- `webhookRoute`

## Commands

- `pnpm dev`  
  Run the worker bundle watcher, `wrangler dev --local`, and the local preview UI together.
  This flow should also try to open `http://127.0.0.1:8788/_ui/` automatically.
- Local preview UI:
  - `http://127.0.0.1:8788/_ui/`
  - reads manifest and route payloads from the local Worker runtime
  - injects the private-route auth header from `.dev.vars` for previewing private endpoints

- `pnpm build`
  One-off build: bundle worker to `dist/worker.mjs` and generate public Static Assets.
- `pnpm deploy`
  Build first, then deploy the Worker with `wrangler deploy`. If you need private outputs refreshed after deploy, send a manual `POST` to your deployed Worker with `Authorization: Bearer YOUR_STATIK_BUILD_TOKEN`. Make sure the deployed Worker has the same secrets as your local `.dev.vars` by setting `STATIK_BUILD_TOKEN`, `STATIK_PRIVATE_AUTH_HEADER_NAME`, and `STATIK_PRIVATE_AUTH_HEADER_VALUE` in Wrangler or the Cloudflare dashboard.

Git-connected deployments also work if you connect this repository in the Cloudflare dashboard. In that setup:

- use `pnpm deploy` as the deploy command if you want the wrapper's build-first behavior
- keep deploy credentials in Cloudflare's build/project secrets or deployment settings
- keep runtime secrets configured on the deployed Worker separately
- set `STATIK_DEPLOY_ORIGIN` to the final deployed Worker or custom domain if you want a saved origin for manual seeding

## Files

- `src-api/` — all your StatikAPI endpoints (JS modules)
- `dist/worker.mjs` — generated worker bundle
- `statikapi.config.js` — project-level Cloudflare defaults
- `wrangler.toml` — Static Assets config, private bucket binding, KV binding, and non-secret runtime env vars
- `.dev.vars` — local/dev values, account-scoped deploy CLI envs, and local copies of the auth/build secrets

## Local preview

`pnpm dev` uses `statikapi-cf dev` to:

- build `dist/worker.mjs` once up front
- keep rebuilding when `src-api/` or `statikapi.config.js` changes
- run `wrangler dev --local` on `http://127.0.0.1:8787`
- run a preview proxy on `http://127.0.0.1:8788/_ui/`

The preview proxy serves the shared StatikAPI UI and forwards route reads to the local Worker.

For private routes, it reads:

- `STATIK_PRIVATE_AUTH_HEADER_NAME`
- `STATIK_PRIVATE_AUTH_HEADER_VALUE`

from `.dev.vars` so you can inspect private outputs locally without manually attaching headers in the browser.

`.dev.vars` is for local development and local deploy CLI environment values on your machine.
It is not uploaded to Cloudflare by itself.

## Route visibility

Public routes are exposed under `/public/...`.

Routes are public by default unless route config marks them private.

Private routes stay at their original route paths and require the configured auth header when the Worker serves them.

Webhook rebuilds follow the same route path as reads:

- `POST /` rebuilds all webhook-enabled routes
- `POST /users/1` rebuilds the private route at `/users/1`
- `POST /public/posts` is rejected because public outputs are Static Assets

Important limitation in this version:

- these webhook rebuilds refresh private Worker-managed outputs
- they do not update already-deployed public Static Assets
- public route changes still require a rebuild and redeploy/publish step

Each route can override the project default with:

```js
export const config = {
  cloudflare: {
    public: false,
    webhook: true,
  },
};
```

## Required Cloudflare setup

Create:

- one private R2 bucket
- one KV namespace for the manifest and runtime limit counters

Where to find the values:

- Cloudflare account id: Dashboard -> Workers & Pages -> Overview
- R2 bucket name: Dashboard -> R2 -> your bucket -> copy the exact bucket name
- KV namespace id: Dashboard -> Workers & Pages -> KV -> your namespace

For deploy automation, use a Cloudflare API token with only the permissions you need. The generated template assumes at least:

- Workers Scripts: Edit
- R2 Storage: Edit
- Workers KV Storage: Edit

The deployed Worker also needs these runtime secrets in Cloudflare:

- `STATIK_BUILD_TOKEN`
- `STATIK_PRIVATE_AUTH_HEADER_NAME`
- `STATIK_PRIVATE_AUTH_HEADER_VALUE`

Set them either:

- in the Cloudflare dashboard under the Worker secrets/settings UI
- or with Wrangler:

```bash
wrangler secret put STATIK_BUILD_TOKEN
wrangler secret put STATIK_PRIVATE_AUTH_HEADER_NAME
wrangler secret put STATIK_PRIVATE_AUTH_HEADER_VALUE
```

Official Cloudflare docs:

- Create API token: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Find account id: https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/
- KV namespaces: https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- R2 buckets: https://developers.cloudflare.com/r2/buckets/create-buckets/

## Local vs deployed variables

Use the generated `.dev.vars` file for:

- local preview/private-route auth during `pnpm dev`
- local `wrangler` commands that need `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN`
- local copies of:
  - `STATIK_BUILD_TOKEN`
  - `STATIK_PRIVATE_AUTH_HEADER_NAME`
  - `STATIK_PRIVATE_AUTH_HEADER_VALUE`
  - optional `STATIK_DEPLOY_ORIGIN`

For deployed Worker runtime behavior in the current scaffold:

- `wrangler.toml` still carries non-secret runtime config such as `STATIK_SRC`, `STATIK_USE_INDEX_JSON`, bindings, and usage-limit values
- `.dev.vars` stays local to your machine
- if you want deployed rebuild webhooks and private auth checks to work, you must also set these in the deployed Worker configuration:
  - `STATIK_BUILD_TOKEN`
  - `STATIK_PRIVATE_AUTH_HEADER_NAME`
  - `STATIK_PRIVATE_AUTH_HEADER_VALUE`

That means:

- `.dev.vars` helps local development and local deploy commands
- `wrangler.toml` is no longer the scaffolded source of truth for the auth/build secrets
- deployed Worker auth/build secrets must be set separately in Cloudflare

Recommended deployed-secret setup:

```bash
wrangler secret put STATIK_BUILD_TOKEN
wrangler secret put STATIK_PRIVATE_AUTH_HEADER_NAME
wrangler secret put STATIK_PRIVATE_AUTH_HEADER_VALUE
```

You can also set those same values from the Cloudflare dashboard under your Worker settings.

## Static assets

Public outputs under `/public/...` are intended to be served as Cloudflare Static Assets through the Worker configuration.
Those asset-matching requests should be served directly by Cloudflare Static Assets rather than forcing the Worker to run first.

By default the assets directory is `public`, but the scaffold can be configured to use a different Static Assets directory if you want.

Private outputs stay behind the Worker and require the configured auth header.

### `STATIK_USE_INDEX_JSON`

This project supports two route-shape modes for Cloudflare output:

- `STATIK_USE_INDEX_JSON = "true"`
  - public routes use index-json paths such as `/public/posts/index.json`
  - public manifest is served at `/public/_manifest/index.json`
- `STATIK_USE_INDEX_JSON = "false"`
  - public routes stay extensionless at the route surface, such as `/public/posts`
  - private routes stay extensionless too, such as `/posts/1`
  - public manifest is served at `/public/_manifest`

Implementation detail for false mode:

- public Static Assets may use hidden `index` files under those extensionless route paths so parent and child routes can coexist locally, for example:
  - route surface: `/public/posts`
  - backing asset file: `public/posts/index`

The preview UI and snippet generator are expected to follow the actual configured route shape.

## Pricing and free-tier expectations

This scaffold uses four Cloudflare surfaces:

- Workers
- Static Assets
- Workers KV
- R2

As of May 2026, the most important free-tier behavior is:

- Static Asset requests are free and unlimited when they do not invoke the Worker
- Workers Free includes `100,000` requests per day
- Workers KV Free includes small daily read/write/list limits and `1 GB` of stored data
- R2 Standard Free includes `10 GB-month` storage, `1 million` Class A operations, and `10 million` Class B operations per month

What that means in practice:

- public route traffic is usually the cheapest part of this architecture
- private route traffic consumes Worker quota and R2 usage
- rebuild-heavy workflows consume Worker, KV, and R2 operations

Quick rules of thumb:

- mostly public traffic
  - best fit for the free tier
- mostly private traffic
  - Worker quota becomes the likely first limit
- frequent private rebuild webhooks
  - Worker + KV + R2 operations become the likely first metered area

If you exceed free-tier limits:

- Workers and KV free-tier limits can start failing requests/operations until reset or until you move to the paid plan
- R2 overage is billed according to Cloudflare's current R2 pricing

Always verify the current numbers before launch:

- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Static Assets billing: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- KV pricing: https://developers.cloudflare.com/kv/platform/pricing/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/

## Deploying this scaffold

1. Create the private R2 bucket.
2. Create the KV namespace.
3. Fill in `wrangler.toml` with the real bucket name, namespace id, and other non-secret runtime config.
4. Review `.dev.vars` for local use and local deploy CLI envs.
5. Set deployed Worker auth/build values in Cloudflare for:
   - `STATIK_BUILD_TOKEN`
   - `STATIK_PRIVATE_AUTH_HEADER_NAME`
   - `STATIK_PRIVATE_AUTH_HEADER_VALUE`
6. Optional: set `STATIK_DEPLOY_ORIGIN` in `.dev.vars` if you want to keep the deployed origin handy for manual seeding.
7. Deploy:

```bash
pnpm deploy
```

This uploads:

- the Worker bundle
- the configured Static Assets directory
- the Worker bindings and non-secret variables from `wrangler.toml`

Because `pnpm deploy` runs the StatikAPI build first, changed public Static Assets are rebuilt before the deploy happens.

Private outputs after deploy:

- if you need to seed private outputs after deploy, use a manual `POST /` against the deployed Worker
- `STATIK_DEPLOY_ORIGIN` is only a convenience value for that manual step, not an automatic seeding switch
- if you do not know the deployed origin from memory, use the placeholder pattern below and substitute your real Worker URL:

```bash
curl -X POST "YOUR_WORKER_URL/" \
  -H "Authorization: Bearer YOUR_STATIK_BUILD_TOKEN"
```

Short production checklist:

1. Create the private R2 bucket.
2. Create the KV namespace.
3. Fill in the real account id, bucket name, namespace id, and local CLI token values.
4. Set deployed Worker auth/build values in Cloudflare for:
   - `STATIK_BUILD_TOKEN`
   - `STATIK_PRIVATE_AUTH_HEADER_NAME`
   - `STATIK_PRIVATE_AUTH_HEADER_VALUE`
5. Decide which routes must stay private because they need webhook-refreshable behavior.
6. Optionally set `STATIK_DEPLOY_ORIGIN` in `.dev.vars` so the deployed origin is easy to reuse in your manual seed command.
7. Run `pnpm deploy`.

## Adding a custom domain

After deploy, attach a production hostname to the Worker.

Cloudflare docs:

- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Typical dashboard flow:

1. Open **Workers & Pages**.
2. Select this Worker.
3. Go to **Settings -> Domains & Routes**.
4. Choose **Add -> Custom Domain**.
5. Enter a hostname such as `api.example.com`.

Cloudflare will create the required DNS/certificate handling for that hostname.

This adapter expects public and private endpoints to share that same hostname, for example:

- `https://api.example.com/public/...`
- `https://api.example.com/account`
