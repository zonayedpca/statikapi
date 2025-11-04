# statikapi — Static API generator (CLI)

Build a folder of JSON endpoints from simple files, then preview them in a lightweight UI.

> Requires **Node 18+**.

## Install

Use without installing (recommended):

```
npx statikapi --help

Or add to a project
pnpm add -D statikapi
# npm i -D statikapi
# yarn add -D statikapi
```

## Commands

```
statikapi <command> [options]

Commands:
  build       Build static JSON endpoints
  dev         Watch & rebuild on changes

Global:
  -h, --help      Show help
  -v, --version   Show version
```

##Quick start

```
# 1) Create a folder with API sources

mkdir src-api
echo "export default { hello: 'world' }" > src-api/index.js

# 2) Build

npx statikapi build --pretty

# 3) Preview (opens http://127.0.0.1:8788/_ui)

npx statikapi preview
```

## Project layout

- src-api/: your source files (default; configurable)
- api-out/: generated JSON, one folder per route (default)

Examples of file → route mapping:

File Route Output file
src-api/index.js / api-out/index.json
src-api/blog/archive.js /blog/archive api-out/blog/archive/index.json
src-api/users/[id].js /users/:id dynamic (see below)
src-api/docs/[...slug].js /docs/\*slug catch-all (see below)

## Dynamic routes

For src-api/users/[id].js, export a paths() function that returns the concrete IDs to prebuild:

```
// src-api/users/[id].js
export async function paths() {
return ['1', '2', '3']; // builds /users/1, /users/2, /users/3
}

export async function data({ params }) {
return { id: params.id };
}
```

Catch-all works similarly:

```
// src-api/docs/[...slug].js
export async function paths() {
return [['a', 'b'], ['guide']]; // → /docs/a/b and /docs/guide
}
export async function data({ params }) {
return { slug: params.slug, path: params.slug.join('/') };
}
```

## Producing data

Each module can export either:

- `export async function data(ctx) { ... }` → its return value is serialized, or
- `export default <value|function>` → if a function, it’s called and awaited.

Returned data must be JSON-serializable (plain objects/arrays, finite numbers, no functions, etc.).

## Config

You can optionally add statikapi.config.js in your project root:

```
export default {
srcDir: 'src-api',
outDir: 'api-out',
};
```

You can override via flags: `--srcDir <dir>`, `--outDir <dir>`.

## Flags (per command)

`build`

- `--pretty` (or `--minify=false`) — pretty-print JSON.
- `--srcDir`, `--outDir` — override config paths.

`dev`

- Rebuilds on changes, updates the preview UI via SSE.
- `--previewHost`, `--previewPort` — where to notify the preview server.
- `--srcDir`, `--outDir` — override config paths.

`preview`

- Serves `api-out/` and the UI at `/\_ui`.
- `--host` (default 127.0.0.1)
- `--port` (default 8788)
- `--open` — try to open the browser
- UI source:
  - `--uiDir <path>` — serve a built UI from this directory
  - Otherwise, uses the embedded UI bundled with the CLI
  - If missing, proxies to a dev UI at `http://127.0.0.1:5173` (override with `--uiDevHost`, `--uiDevPort`)

## Examples

There are two example projects in this repo under `example/`:

```
# from repo root

pnpm -C example/basic dev
pnpm -C example/basic preview

pnpm -C example/dynamic dev
pnpm -C example/dynamic preview
```

## Troubleshooting

- UI doesn’t load: ensure `preview` is running; if you’re developing the UI separately, start Vite on port 5173 or pass `--uiDir` to serve a built UI.
- Dynamic routes not emitted: make sure the file exports a valid `paths()` function returning strings (or arrays of strings for catch-all).

License

MIT – see LICENSE
