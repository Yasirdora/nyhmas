# nyhmas · Svelte (Vite) example

Minimal Svelte 5 + Vite consumer of the [`nyhmas`](../../) visualizer package.

```bash
npm install
npm run dev
```

Open the printed URL, pick an audio file, press Play.

> This workspace example resolves `nyhmas` via `"file:../.."`. In your own
> project, use the published package instead:
>
> ```bash
> npm install nyhmas three
> ```

The entire integration lives in [`src/App.svelte`](src/App.svelte): create the
visualizer against a `bind:this` element in `onMount`, and `dispose()` it in
the cleanup.
