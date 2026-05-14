# StatikAPI

<p align="center">
  <img src="./docs/assets/readme-hero.gif" alt="StatikAPI quick start: scaffold, dev, build, deploy" width="100%" />
</p>

StatikAPI turns filesystem route modules into static JSON endpoints.
Use it when you want a simple route-file workflow, local preview, and a clear deployment path.

## Quick Start

### 1. Scaffold a project

Pick the package manager you already use:

```bash
pnpm dlx create-statikapi my-api
```

```bash
yarn dlx create-statikapi my-api
```

```bash
npx create-statikapi my-api
```

To start with the Cloudflare scaffold:

```bash
pnpm dlx create-statikapi my-worker --template cloudflare-adapter
```

### 2. Edit your source files

Add or update route modules in `src-api/`.

```js
// src-api/index.js
export default {
  hello: 'world',
};
```

If you want to adjust the local build output, edit `statikapi.config.js`:

```js
export default {
  srcDir: 'src-api',
  outDir: 'api-out',
};
```

### 3. Run the dev loop

Use the generated project scripts:

```bash
pnpm dev
```

That gives you:

- a watch/build loop
- the preview UI at `/_ui`
- local JSON output refreshes as you edit routes

### 4. Build for deployment

When the project is ready:

```bash
pnpm build
```

That writes the generated API output to `api-out/`.

## Cloudflare Controls

If you want the Cloudflare path, scaffold with `--template cloudflare-adapter`.
That template gives you a Worker + Static Assets setup with project controls in:

- `wrangler.toml` for Static Assets, R2, KV, and runtime vars
- `.dev.vars` for local dev values and local deploy CLI envs
- `statikapi.config.js` for Cloudflare project defaults and route visibility

The usual flow is:

```bash
pnpm dev
pnpm build
pnpm deploy
```

Use the Cloudflare scaffold when you want:

- public routes served from Static Assets
- private routes behind the Worker
- explicit auth-header control for private access
- a deploy path that matches the Cloudflare contract

## For contributors

If you are working on the StatikAPI repository itself, use these links instead of this quick-start guide:

- [Contributing guide](CONTRIBUTING.md)
- [Docs site content](docs/)
- [Canonical plan notes](.codex/canonical-plan/README.md)

## License

[MIT](LICENSE) © 2025 StatikAPI contributors

See also [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
