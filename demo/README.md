# NYHMAS playground

The full interactive demo for the [`nyhmas`](../) package — upload a track,
switch effects, add titles/lyrics/branding, export video. Built with
React + Vite + Tailwind.

It consumes the package **source** (`../src`, via a Vite alias) so engine and
effect edits hot-reload while iterating.

```bash
npm install
npm run dev
```

Self-test: open `/` with `?selftest=export` to run a 2 s offline render
end-to-end; the result is reported in `document.title` (used by smoke tests).

## Deploy (Cloudflare Pages)

| Setting | Value |
| --- | --- |
| Root directory | *(leave empty — the repo root)* |
| Build command | `npm ci && npm --prefix demo ci && npm --prefix demo run build` |
| Output directory | `demo/dist` |

The build must run from the repo root: the demo bundles the package **source**
(`../src`), whose own imports (`three`, `mediabunny`) resolve from the root
`node_modules` — so both dependency trees must be installed.

Everything is static and client-side (WebGL2 + Web Audio + WebCodecs) — no
SSR, no Functions. `_headers` in `public/` adds immutable caching for the
hashed assets.
