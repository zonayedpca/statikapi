# APP_NAME — Cloudflare Worker + Static Assets via StatikAPI

This project uses **@statikapi/adapter-cf** to:

- Discover your `src-api/` routes
- Bundle a Cloudflare Worker to `dist/worker.mjs`
- Treat **public** route output as public-by-default and expose it from the `/public` partition
- Write **private** route output into a private R2 bucket
- Store a manifest and runtime limit counters in KV
- Trigger rebuilds via authenticated `POST` webhooks on route paths

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
  Deploy the Worker with `wrangler deploy`.

## Files

- `src-api/` — all your StatikAPI endpoints (JS modules)
- `dist/worker.mjs` — generated worker bundle
- `statikapi.config.js` — project-level Cloudflare defaults
- `wrangler.toml` — Static Assets config, private bucket binding, KV binding, and runtime env vars
- `.dev.vars.example` — copy to `.dev.vars` for local secrets and account-scoped deploy envs

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

Official Cloudflare docs:

- Create API token: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- API token permissions: https://developers.cloudflare.com/fundamentals/api/reference/permissions/
- Find account id: https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/
- KV namespaces: https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- R2 buckets: https://developers.cloudflare.com/r2/buckets/create-buckets/

## Static assets

Public outputs under `/public/...` are intended to be served as Cloudflare Static Assets through the Worker configuration.
Those asset-matching requests should be served directly by Cloudflare Static Assets rather than forcing the Worker to run first.

By default the assets directory is `public`, but the scaffold can be configured to use a different Static Assets directory if you want.

Private outputs stay behind the Worker and require the configured auth header.

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
3. Fill in `wrangler.toml` with the real bucket name, namespace id, account id, and deploy token.
4. Copy `.dev.vars.example` to `.dev.vars` for local use.
5. Build:

```bash
pnpm build
```

6. Deploy:

```bash
pnpm deploy
```

This uploads:

- the Worker bundle
- the configured Static Assets directory
- the Worker bindings and variables from `wrangler.toml`

Short production checklist:

1. Create the private R2 bucket.
2. Create the KV namespace.
3. Fill in the real account id, bucket name, namespace id, and token values.
4. Decide which routes must stay private because they need webhook-refreshable behavior.
5. Run `pnpm build`.
6. Run `pnpm deploy`.

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
