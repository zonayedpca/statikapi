# TODO

This file is the live status board for work in this repo.

Use these statuses:

- `🟦 Todo`: defined but not started
- `🟨 In Progress`: implementation is actively underway
- `🟪 QA Ready`: implementation is complete and waiting for QA confirmation
- `✅ Done`: fully tested and confirmed

## Workflow

1. Read `README.md`.
2. Read `.codex/canonical-plan/README.md`.
3. Read only the canonical plan files relevant to the task.
4. Compare the requested task against the current canonical plan before adding it to this tracker as a normal item.
5. If the task conflicts with the current canon:
   - stop
   - explain the mismatch clearly
   - ask whether to update the canonical plan or adjust the task
   - do not add it as a normal `TODO` item
   - mark it as blocked or pending canon decision
   - do not code until that decision is made
6. If the task is aligned:
   - add it as a normal `TODO` item
   - move it to `In Progress` before making changes
   - implement the smallest non-breaking change that satisfies the task
   - add or update tests when behavior changes
   - run the smallest meaningful verification
7. Move an item to `QA Ready` only when implementation is complete, local verification has passed, and a commit is prepared using the repo's commit style guide in `CONTRIBUTING.md`.
8. Move an item to `Done` only after the change has been properly tested and confirmed.

## Status Board

| ID       | Task                                                                                                                                                                                                                                                               | Status          | Latest note                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STK-0001 | Establish root TODO workflow with canonical-plan preflight and status gates                                                                                                                                                                                        | ✅ Done         | `TODO.md` created; workflow captures canon check, mismatch stop rule, implementation flow, and verification gates.                                                                                                                                                                                |
| STK-0002 | Add optional collection index output for dynamic and catch-all routes, with selectable exposed keys                                                                                                                                                                | ✅ Done         | Local canon updated first; CLI now supports `config.listIndex`; verified with targeted build tests and syntax checks.                                                                                                                                                                             |
| STK-0003 | Require a repo-style commit before moving work to `QA Ready`                                                                                                                                                                                                       | ✅ Done         | `TODO.md` now requires a `CONTRIBUTING.md`-style commit at the `QA Ready` gate.                                                                                                                                                                                                                   |
| STK-0004 | Add global collection index controls via CLI flags and `statikapi.config.js`, with local route config overriding global defaults                                                                                                                                   | ✅ Done         | Implemented and verified locally; route config overrides global defaults from config and flags; prepared commit subject: `feat(config): add global list index defaults`.                                                                                                                          |
| STK-0005 | Expand the Cloudflare adapter and `create-statikapi` flow to cover serving-mode selection, `/public` partitioning, public/private routing, auth-header envs, webhook controls, deploy wiring, Cloudflare account/token onboarding, usage limits, and matching docs | ✅ Done         | Implemented in `create-statikapi`, `@statikapi/adapter-cf`, example Cloudflare app, and public docs; verified with scaffold tests, adapter runtime tests, and syntax checks; prepared commit: `feat(cloudflare): expand worker and scaffold contract`.                                            |
| STK-0006 | Add `config.listIndex` support to `@statikapi/adapter-cf`, including project defaults, route overrides, derived collection/index outputs, and manifest coverage                                                                                                    | 🟪 QA Ready     | Canon updated first; adapter runtime now emits collection indexes in Cloudflare builds and targeted rebuilds; verified with `node --test packages/adapter-cloudflare/test/runtime.test.js`; prepared commit subject: `feat(cloudflare): add collection index outputs`.                            |
| STK-0007 | Add Cloudflare local preview parity with the shared UI through a preview proxy, Worker manifest/route forwarding, local private-route auth injection, and refresh behavior                                                                                         | 🟪 QA Ready     | Canon updated first; `statikapi-cf preview` now serves `/_ui/`, scaffolded Cloudflare apps run it during `pnpm dev`, and preview behavior is verified with adapter preview/runtime tests plus Cloudflare scaffold coverage; prepared commit subject: `feat(cloudflare): add local preview proxy`. |
| STK-0008 | Simplify the Cloudflare contract to a single Worker + Static Assets model with public-by-default routes, no `r2-public` mode, and private routes behind the Worker                                                                                               | 🟪 QA Ready     | Scaffold, runtime, tests, docs, and QA now target the single Static Assets model. Public routes are emitted at build time; private routes remain Worker-managed.                                                                                                                                 |
| STK-0009 | Make Cloudflare `dev` reliably launch the shared preview UI by default across package managers, open it like regular local dev, and keep previewed outputs updating as source changes rebuild them                                                                | 🟨 In Progress  | Canon updated first; adapter now has a first-class `dev` command and scaffold scripts point to it, but final end-to-end local confirmation is still pending.                                                                                                                                      |
