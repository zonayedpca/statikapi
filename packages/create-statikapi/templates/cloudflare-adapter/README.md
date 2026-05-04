# APP_NAME — Cloudflare Worker + R2 via StatikAPI

This project uses **@statikapi/adapter-cf** to:

- Discover your `src-api/` routes
- Bundle a Cloudflare Worker to `dist/worker.mjs`
- Write **public** route output into a `/public` partition in a public R2 bucket
- Write **private** route output into a private R2 bucket
- Store a manifest and runtime limit counters in KV
- Trigger rebuilds via authenticated `/build` endpoints

## Commands

- `pnpm dev`  
  Run `statikapi-cf` in watch mode and start `wrangler dev --local`.

- `pnpm build`
  One-off build: bundle worker to `dist/worker.mjs`.
- `pnpm deploy`
  Deploy the Worker with `wrangler deploy`.

## Files

- `src-api/` — all your StatikAPI endpoints (JS modules)
- `dist/worker.mjs` — generated worker bundle
- `statikapi.config.js` — project-level Cloudflare defaults
- `wrangler.toml` — public/private bucket bindings, KV binding, and runtime env vars
- `.dev.vars.example` — copy to `.dev.vars` for local secrets and account-scoped deploy envs

## Route visibility

Public routes are exposed under `/public/...`.

Private routes stay at their original route paths and require the configured auth header when the Worker serves them.

Each route can override the project default with:

```js
export const config = {
  cloudflare: {
    public: true,
    webhook: true
  }
};
```

## Required Cloudflare setup

Create:

- one public R2 bucket
- one private R2 bucket
- one KV namespace for the manifest and runtime limit counters

For deploy automation, use a Cloudflare API token with only the permissions you need. The generated template assumes at least:

- Workers Scripts: Edit
- R2 Storage: Edit
- Workers KV Storage: Edit

## Serving modes

`statikapi.config.js` sets one of:

- `worker`: the Worker serves both `/public/...` and private routes
- `r2-public`: public routes are expected to be served from the public R2 bucket or its custom domain, while private routes stay behind the Worker
