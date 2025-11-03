# APP_NAME — Remote Data (Build-time Fetch)

This template shows how to fetch **remote API data at build time** and emit static JSON endpoints.

It currently uses [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com) as a demo source, but you can swap the URLs for any API.

## Endpoints

- `/` — project info
- `/posts` — first 10 posts (fetched at build time)
- `/posts/:id` — prebuilt post pages for ids 1–10
- `/users` — first 5 users (fetched at build time)

## Commands

- `pnpm dev` — watch & rebuild
- `pnpm build` — one-off build to `api-out/`
