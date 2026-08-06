# NYHMAS — repo guide

## Layout

- `src/` — the `nyhmas` npm package source (engine, effects, overlays, export)
- `demo/` — React + Vite playground; an npm workspace, consumes `src/` via a Vite alias, deploys to Cloudflare Pages
- `examples/` — minimal standalone consumers (React, Svelte) that verify the built package. Deliberately *not* workspaces: they install `nyhmas` as `file:../..` to exercise the published artifact like a real consumer.

## Setup

```bash
npm install
```

One install at the repo root covers `demo/` too (npm workspace, single lockfile). `examples/` install separately.

## Commands (repo root)

- `npm run dev` — start the playground dev server (Vite, hot-reloads package source)
- `npm test` — vitest unit tests
- `npm run lint` / `npm run lint:fix` — biome
- `npm run check` — type-check package + demo (tsc)
- `npm run build:package` — build the publishable bundle into `dist-package/`
- `npm --prefix demo run build` — build the deployable demo into `demo/dist/`

## Conventions

- Package code must stay framework-free and import-safe (no DOM at module scope).
- The demo and examples import only from the public package surface (`nyhmas`), never deep paths.
- Demo smoke test: open `/` with `?selftest=export`; the result is reported in `document.title`.
- Never commit `dist/`, `dist-package/`, or `node_modules/`.
