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
  One-off build: bundle worker to `dist/worker.mjs`.
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

## Static assets

Public outputs under `/public/...` are intended to be served as Cloudflare Static Assets through the Worker configuration.
Those asset-matching requests should be served directly by Cloudflare Static Assets rather than forcing the Worker to run first.

By default the assets directory is `public`, but the scaffold can be configured to use a different Static Assets directory if you want.

Private outputs stay behind the Worker and require the configured auth header.
