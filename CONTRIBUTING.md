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

Use clear, conventional-ish messages. Prefer the format:

```
type(scope): subject
```

**Scope** is usually a package or subsystem (e.g. `cli`, `core`, `ui`, `create-statikapi`, `router`, `loader`, `manifest`, `preview`, `config`).

---

### 🧱 Common Types (with StatikAPI-flavored examples)

| Type         | Purpose                                     | Examples                                                                                               |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **feat**     | New user-visible feature                    | `feat(cli): add --pretty flag to build output`<br>`feat(ui): JSON tree / pretty / raw tabs`            |
| **fix**      | Bug fix                                     | `fix(router): ignore underscored files and _private dirs`<br>`fix(loader): reject circular structures` |
| **perf**     | Performance improvement                     | `perf(build): stream writes for large JSON endpoints`                                                  |
| **refactor** | Non-functional internal change              | `refactor(core): extract serializeGuard()`<br>`refactor(cli): split preview into subcommands`          |
| **build**    | Build system or external dependency changes | `build(ui): vite proxy for /_ui/events`<br>`build(repo): bump pnpm to v9`                              |
| **ci**       | CI/CD pipeline or automation                | `ci: release workflow with provenance + pnpm cache`                                                    |
| **docs**     | Documentation only                          | `docs: add dynamic routes guide`<br>`docs(create-statikapi): quickstart examples`                      |
| **style**    | Code style / formatting only                | `style(ui): run prettier on src/components`                                                            |
| **test**     | Add or fix tests                            | `test(cli): manifest smoke test for "/" entry`<br>`test(create-statikapi): scaffold dynamic template`  |
| **chore**    | Maintenance / tooling                       | `chore(repo): align .editorconfig + prettier config`                                                   |
| **security** | Security patch                              | `security(cli): sanitize route param printing`                                                         |
| **deps**     | Dependency bump                             | `deps(ui): upgrade react to 18.3.1`                                                                    |
| **release**  | Version tags and changelog updates          | `release: v0.1.1`                                                                                      |

---

### 🎯 Recommended Scopes

- Packages: `cli`, `core`, `ui`, `create-statikapi`
- Subsystems: `router`, `loader`, `manifest`, `preview`, `config`, `errors`, `dev`, `build`, `sse`, `snippets`

---

### ✍️ Subject Line Rules

- Use **imperative mood**, lowercase after colon, ≤ 72 characters.
  - ✅ `fix(cli): handle CJS default export in loader`
  - ❌ `Fixed the loader issue`
- No ending punctuation.
- Be concise and clear.

---

### 📄 Commit Body (Optional but Encouraged)

Use the body to explain **what** and **why**, not the how.  
Wrap lines around 72 chars.

Example:

```
feat(cli): write manifest with bytes & hash

- Include mtime as number for stable comparisons
- Hash is a hex of content to drive cache busting
```

---

### ⚠️ Breaking Changes

Use `!` after type/scope or include a `BREAKING CHANGE:` footer.

```
feat(cli)!: rename --watch to dev

BREAKING CHANGE: The old `statikapi build --watch` is removed.
Use `statikapi dev` for incremental rebuilds.
```

---

### 🔗 References & Co-authors

- `Closes #123`
- `Refs #456`
- `Co-authored-by: Name <email>`

---

### 💡 Optional Emoji Style

| Emoji | Type    | Example                                |
| ----- | ------- | -------------------------------------- |
| ✨    | feat    | `✨ feat(cli): add pretty output`      |
| 🐛    | fix     | `🐛 fix(loader): reject invalid JSON`  |
| 🧪    | test    | `🧪 test(router): stable route order`  |
| 🔧    | chore   | `🔧 chore(repo): update pnpm lockfile` |
| 🛠️    | build   | `🛠️ build(ui): add vite alias`         |
| 🚀    | release | `🚀 release: v0.1.1`                   |

---

### 📚 Compact Real Examples

- `cli(build): write manifest with bytes & hash`
- `ui: pretty/raw toggle + copy button`
- `docs: add dynamic routes guide`
- `fix(loader): error on non-finite numbers`
- `feat(create-statikapi): add --template dynamic`
- `perf(preview): cache manifest in memory`
- `ci: publish order core → cli → create-statikapi`
- `test(router): stable ordering for static/dynamic/catchall`
- `chore(repo): add pnpm-workspace.yaml`
- `release: v0.1.1`

---

### 🧩 Commit Template (optional)

You can enable a commit message template for consistency:

```
git config commit.template .gitmessage
```

Example `.gitmessage`:

```
type(scope): subject

# Explain WHAT and WHY
# - Bullet point 1
# - Bullet point 2
# (Wrap to ~72 chars)

# Closes #
```

---

**✅ TL;DR:**  
Keep commits small, scoped, imperative, and meaningful.  
Example:  
`feat(cli): add dev command with live reload`

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
