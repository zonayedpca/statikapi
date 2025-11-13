# APP_NAME — Cloudflare Worker (R2 + KV) via StatikAPI

This project uses **@statikapi/adapter-cf** to:

- Discover your `src-api/` routes
- Bundle a Cloudflare worker (`dist/worker.mjs`)
- Write JSON output into **R2** with a manifest in **KV**
- Trigger rebuilds via authenticated `/build` endpoints

## Commands

- `pnpm dev`  
  Run `statikapi-cf` in watch mode and start `wrangler dev --local`.

- `pnpm build`  
  One-off build: bundle worker to `dist/worker.mjs`.

## Files

- `src-api/` — all your StatikAPI endpoints (JS modules)
- `dist/worker.mjs` — generated worker bundle
- `wrangler.example.toml` — copy this to `wrangler.toml` and fill in:
  - R2 bucket name
  - KV namespace
  - `STATIK_BUILD_TOKEN`
