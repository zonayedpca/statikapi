# StatikAPI

<p align="center">
  <img src="./docs/assets/readme-hero.gif" alt="StatikAPI setup flow: scaffold, dev, deploy" width="100%" />
</p>

StatikAPI turns filesystem route modules into static JSON endpoints, a local preview UI, and Cloudflare-ready scaffolds.
It is built for OSS developers who want a simple local loop, a clear deployment story, and a repo they can understand quickly.

## Why it exists

- Build API payloads from route files instead of hand-writing JSON assets.
- Keep local development fast with `statikapi dev` and the preview UI at `/_ui`.
- Scaffold new projects with `create-statikapi`, including a Cloudflare path.
- Keep the repo structure small enough that contributors can find the contract quickly.

## At A Glance

| Package | Role |
| --- | --- |
| `packages/cli` | Local `statikapi` build, dev, and preview runtime |
| `packages/ui` | Shared React preview UI rendered in dev |
| `packages/create-statikapi` | Project scaffolding and template generation |
| `packages/adapter-cloudflare` | Cloudflare Worker + Static Assets build/runtime |
| `packages/core` | Minimal shared package namespace |

## OSS Workflow

1. Scaffold a new project:
   `npx create-statikapi my-api --template cloudflare-adapter`
2. Run local development:
   `pnpm dev`
3. Build static output:
   `pnpm build`
4. Deploy when ready:
   `pnpm deploy`

## Monorepo Map

```
.
├─ packages/
│  ├─ cli/              → The `statikapi` CLI (build, dev, preview)
│  ├─ core/             → Shared utilities and internal helpers
│  ├─ ui/               → React preview UI served at /_ui
│  └─ create-statikapi/ → Project scaffolder
│
├─ example/
│  ├─ basic/            → Simple static routes
│  ├─ dynamic/          → Dynamic + catch-all routes
│  └─ showcase/         → Full TS example (remote fetch, dynamic, catch-all)
│
├─ docs/                → OSS documentation content (MDX)
├─ .github/             → Issue templates + release workflows
└─ scripts, configs, etc.
```

---

## ⚙️ Development Setup

### 1. Requirements

- **Node.js 22+**
- **pnpm 9+**
- macOS, Linux, or Windows (PowerShell or WSL recommended)

### 2. Install Dependencies

```bash
git clone https://github.com/zonayedpca/statikapi.git
cd statikapi
pnpm install
```

### 3. Build & Watch

During local development you usually work on both the CLI and UI:

```bash
# From repo root
pnpm dev
```

This runs:

- `example/basic` via CLI dev mode (`statikapi dev`)
- `packages/ui` Vite dev server  
  Both run concurrently so the embedded preview UI stays live.

You can open the preview at  
👉 **http://127.0.0.1:8788/_ui**

---

## 🧪 Running Examples

Each example can be run independently:

```bash
# Basic
pnpm -C example/basic dev

# Dynamic
pnpm -C example/dynamic dev

# Showcase (TypeScript)
pnpm -C example/showcase dev
```

Or build them once:

```bash
pnpm -C example/showcase build
```

Outputs will appear in each project’s `api-out/` folder.

---

## 🧩 Commands (Development Reference)

### CLI

The `packages/cli` package provides the main binary `statikapi`.

```bash
node packages/cli/bin/statikapi.js --help
```

| Command | Description                                 |
| ------- | ------------------------------------------- |
| `build` | Build static JSON endpoints into `api-out/` |
| `dev`   | Watch & rebuild on changes, serve UI + SSE  |

---

### UI

The React preview UI lives in `packages/ui`.  
You can build or preview it directly:

```bash
pnpm -C packages/ui dev
pnpm -C packages/ui build
```

The CLI automatically embeds a built copy of this UI during publish via  
`scripts/embed-ui.js`, copied into `packages/cli/ui/`.

---

## 🧰 Useful Scripts

| Script               | Description                    |
| -------------------- | ------------------------------ |
| `pnpm -w lint`       | Run ESLint across all packages |
| `pnpm -w format`     | Check Prettier formatting      |
| `pnpm -w format:fix` | Auto-format code               |
| `pnpm -r test`       | Run all tests in all packages  |
| `pnpm ui:build`      | Build UI + embed into CLI      |
| `pnpm test:watch`    | Run tests in watch mode        |

---

## 🧪 Testing

All tests are written using Node’s built-in `node:test` runner.

```bash
pnpm -r test
```

Tests cover:

- Core build logic (`build`, `loadPaths`, `serializeGuard`, etc.)
- CLI invocation
- Dynamic / catch-all routes
- Config validation

---

## 🚀 Release Flow

Publishing is automated via **GitHub Actions** (`.github/workflows/release.yml`):

1. Triggered on pushing a version tag (e.g. `v0.6.4`).
2. Verifies tag version matches `package.json` across packages.
3. Builds & embeds the UI.
4. Packs and publishes in order:
   - `@statikapi/core`
   - `statikapi` (CLI)
   - `create-statikapi`

The workflow also verifies that the CLI tarball includes its embedded UI (`ui/index.html`, `ui/assets/*`).

---

## 🧑‍💻 Contributing

1. Fork and branch off `main` (`feat/…`, `fix/…`, etc.)
2. Run `pnpm install && pnpm dev`
3. Lint & test before committing.
4. Follow the commit convention defined in [`CONTRIBUTING.md`](CONTRIBUTING.md).
5. Open a PR — CI must pass before merge.

---

## 📄 License

[MIT](LICENSE) © 2025 StatikAPI contributors  
See also [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

**Happy hacking!**  
If you’re running `pnpm dev`, your live playground should be waiting at  
👉 http://127.0.0.1:5173/_ui
