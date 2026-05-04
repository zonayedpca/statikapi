# TODO

This file is the live status board for work in this repo.

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

| ID | Task | Status | Latest note |
| --- | --- | --- | --- |
| STK-0001 | Establish root TODO workflow with canonical-plan preflight and status gates | Done | `TODO.md` created; workflow captures canon check, mismatch stop rule, implementation flow, and verification gates. |
| STK-0002 | Add optional collection index output for dynamic and catch-all routes, with selectable exposed keys | Done | Local canon updated first; CLI now supports `config.listIndex`; verified with targeted build tests and syntax checks. |
| STK-0003 | Require a repo-style commit before moving work to `QA Ready` | Done | `TODO.md` now requires a `CONTRIBUTING.md`-style commit at the `QA Ready` gate. |
| STK-0004 | Add global collection index controls via CLI flags and `statikapi.config.js`, with local route config overriding global defaults | Done | Implemented and verified locally; route config overrides global defaults from config and flags; prepared commit subject: `feat(config): add global list index defaults`. |
| STK-0005 | Expand the Cloudflare adapter and `create-statikapi` flow to cover serving-mode selection, `/public` partitioning, public/private routing, auth-header envs, webhook controls, deploy wiring, Cloudflare account/token onboarding, usage limits, and matching docs | Done | Implemented in `create-statikapi`, `@statikapi/adapter-cf`, example Cloudflare app, and public docs; verified with scaffold tests, adapter runtime tests, and syntax checks; prepared commit: `feat(cloudflare): expand worker and scaffold contract`. |
