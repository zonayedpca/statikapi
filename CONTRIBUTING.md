# Contributing to StatikAPI

Thanks for your interest! This guide explains how to set up the repo, make changes, and open PRs.

## Repo Setup

- **Requirements**: Node 22, pnpm, git
- **Install**: `pnpm install`
- **Build/Type**: JavaScript (ESM). No TypeScript.
- **Packages**:
  - `packages/cli` – CLI (`statikapi`)
  - `packages/core` – shared logic
  - `packages/ui` – preview React UI
  - `example/*` – sample projects
  - `docs/` – OSS docs content (MDX files consumed by the website later)

## Scripts

- Lint: `pnpm -w lint`
- Format check: `pnpm -w format`
- Format write: `pnpm -w format:fix`
- Tests: `pnpm -w test`

## Development Tips

- Use Node 22 (`.nvmrc` provided).
- All packages are ESM—avoid CJS unless tests need it.
- Keep CLI stdout stable (tests parse messages).

## Commit Style

Use clear, conventional-ish messages, e.g.:

- `cli(build): write manifest with bytes & hash`
- `ui: pretty/raw toggle + copy button`
- `docs: add dynamic routes guide`

## PR Guidelines

1. Fork & branch: `feat/<short-name>` or `fix/<short-name>`.
2. Add tests when possible (CLI behavior is covered by `node:test`).
3. `pnpm -w lint && pnpm -w test` must pass.
4. Describe _what_ changed and _why_. Link issues.

## Issue Workflow

- Use the provided templates (bug/feature).
- Repro steps and expected behavior are essential for bug reports.

## Releasing

- UI is embedded into CLI on publish via `packages/cli/scripts/embed-ui.js`.
- Do not break `/_ui/index`, `/_ui/file`, `/_ui/events`.

## Code of Conduct

See `CODE_OF_CONDUCT.md`.
