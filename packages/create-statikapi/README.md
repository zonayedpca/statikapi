# create-statikapi

Scaffold a new **StatikAPI** project.

## Usage

```bash
# Basic
npx create-statikapi my-api

# Choose template and skip install
npx create-statikapi my-api --template dynamic --no-install

# Pick package manager
npx create-statikapi my-api --package-manager npm
```

## Flags

- `--template basic|dynamic` (default: `basic`)

- `--no-install` — skip installing dependencies

- `--package-manager pnpm|npm|yarn` (default: `pnpm`)

- `--yes` — accept defaults (for future prompts)

- `--help` — show usage

---

### Hook it into your workspace root

Add the new package to the monorepo (you already have `packages/*` in `pnpm-workspace.yaml`, so nothing else needed). The **root test script** will automatically pick up `packages/create-statikapi/test/*.test.js` once you add those files I gave earlier.

---

If you want, I can also paste a **one-shot commit message** for adding this package + tests.
