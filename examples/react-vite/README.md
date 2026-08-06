# nyhmas · React (Vite) example

Minimal React + Vite consumer of the [`nyhmas`](../../) visualizer package.

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

The entire integration lives in [`src/App.tsx`](src/App.tsx): create the
visualizer against a container element in `useEffect`, and `dispose()` it in
the cleanup (StrictMode-safe).
