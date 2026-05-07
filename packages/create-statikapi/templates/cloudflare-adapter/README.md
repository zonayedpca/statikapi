# APP_NAME — Cloudflare Worker + Static Assets via StatikAPI

This project uses **@statikapi/adapter-cf** to:

- Discover your `src-api/` routes
- Bundle a Cloudflare Worker to `dist/worker.mjs`
- Treat **public** route output as public-by-default and expose it from the `/public` partition
- Write **private** route output into a private R2 bucket
- Store a manifest and runtime limit counters in KV
- Trigger rebuilds via authenticated `/build` endpoints

## Commands

- `pnpm dev`  
  Run the worker bundle watcher, `wrangler dev --local`, and a local preview UI.
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

`pnpm dev` starts three processes:

- a watcher that rebuilds `dist/worker.mjs`
- `wrangler dev --local` on `http://127.0.0.1:8787`
- a preview proxy on `http://127.0.0.1:8788/_ui/`

The preview proxy serves the shared StatikAPI UI and forwards route reads to the local Worker.

For private routes, it reads:

- `STATIK_PRIVATE_AUTH_HEADER_NAME`
- `STATIK_PRIVATE_AUTH_HEADER_VALUE`

from `.dev.vars` so you can inspect private outputs locally without manually attaching headers in the browser.

## Route visibility

Public routes are exposed under `/public/...`.

Routes are public by default unless route config marks them private.

Private routes stay at their original route paths and require the configured auth header when the Worker serves them.

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

By default the assets directory is `public`, but the scaffold can be configured to use a different Static Assets directory if you want.

Private outputs stay behind the Worker and require the configured auth header.
