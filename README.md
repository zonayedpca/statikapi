# StatikAPI

<p align="center">
  <img src="./docs/assets/readme-hero.gif" alt="StatikAPI setup flow: scaffold, dev, deploy" width="100%" />
</p>

StatikAPI turns filesystem route modules into static JSON endpoints.
Use it when you want a simple local workflow for route files, build output, and previewing the result before you deploy.

## Use StatikAPI in your project

1. Scaffold a new project:
   `npx create-statikapi my-api`
2. Install dependencies and start local development:
   `pnpm install`
   `pnpm dev`
3. Build and deploy when ready:
   `pnpm build`
   `pnpm deploy`

That flow gives you:

- filesystem route modules in `src-api/`
- generated JSON output in `api-out/`
- a local preview UI at `/_ui`
- a deployment path for the scaffolded project you created

If you want the deployment-specific guidance, use the docs linked below.

## If you are working on StatikAPI itself

This repository also contains the CLI, preview UI, scaffolder, Cloudflare adapter, examples, and docs that power the product.
Those repo-specific details live in the contributor and docs links below so this README can stay focused on usage.

- [Contributing guide](CONTRIBUTING.md)
- [Docs site content](docs/)
- [Canonical plan notes](.codex/canonical-plan/README.md)

## What lives here

- `packages/cli` for the `statikapi` CLI
- `packages/ui` for the preview UI
- `packages/create-statikapi` for scaffolding
- `packages/adapter-cloudflare` for the Cloudflare adapter
- `packages/core` for the shared package namespace
- `example/` for runnable reference projects

## License

[MIT](LICENSE) © 2025 StatikAPI contributors

See also [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
