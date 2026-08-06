# NYHMAS

**Audio, made visible.** Upload any track, watch it become a living visual, and export it as video — entirely in the browser. Nothing is uploaded; your audio never leaves your device.

Built as a production-grade platform designed to scale to 100+ visual effects while staying smooth on mid-range hardware.

---

## Highlights

- **Upload → visualize → export** — drag in any audio (MP3/WAV/OGG/FLAC/M4A/AAC), pick an effect, record a video.
- **Fully client-side** — WebAudio + WebGL + WebCodecs. No server, no cost per user, private by default.
- **Deterministic engine** — effects read time and audio from swappable sources, so frame-perfect export "just works" for every effect without per-effect code.
- **Adaptive quality** — resolution scales to hold ~60 fps on the device you're on.
- **Liquid Glass UI** — true-black OLED stage, frosted controls, SF-style type, one restrained accent.
- **Two export tiers** — real-time capture (universal) and deterministic WebCodecs render (frame-perfect MP4).

## Getting started

```bash
npm install && npm --prefix demo install
npm run dev      # playground → http://localhost:5173
```

Other scripts:

```bash
npm run build    # package (dist-package/) + demo (demo/dist/)
npm run preview  # preview the demo build
npm run test     # unit tests (Vitest)
npm run lint     # Biome check (lint:fix to auto-fix)
npm run check    # type-check package + demo (tsc)
```

A demo track ships in `demo/public/demo/track.mp3` (the "Try the demo" button).

## Use it as a package

The engine, effects, overlays, and export pipeline ship as the `nyhmas` npm package (ESM + types; `three` is a peer dependency):

```bash
npm install nyhmas three
```

```ts
import { createVisualizer } from 'nyhmas';

const viz = await createVisualizer(document.getElementById('stage')!, {
  effect: 'aura', // 'gold-particles' | 'orb' | 'galaxy' | 'aura'
});
viz.start();                      // run the render loop (idles silently)
await viz.loadTrack(file);        // File, Blob, or ArrayBuffer
await viz.play();
```

The container needs a CSS size and non-static positioning (the canvas mounts absolutely inside it). For custom work, the lower-level pieces are exported too: `Engine`, `AudioEngine`, `Scene3DEffect` / `ShaderEffect` / `ParticleEffect` base classes, `OverlayLayer`, the `EFFECTS` registry — and the full export pipeline (`OfflineRenderer` for deterministic WebCodecs MP4 renders, `Recorder` for real-time capture, `offlineExportSupported` for feature detection).

### Framework examples

`nyhmas` is framework-agnostic — it only needs a DOM element and WebGL2. Runnable minimal integrations live in [`examples/`](examples/):

- [`examples/react-vite`](examples/react-vite) — React 19 + Vite (StrictMode-safe mount/dispose)
- [`examples/svelte-vite`](examples/svelte-vite) — Svelte 5 + Vite (`onMount` + `bind:this`)

Vue, Solid, Next.js, Nuxt, etc. follow the same pattern: create in the client-side mount hook, `dispose()` on unmount.

## Deployment

The demo builds to a fully static `demo/dist/` — no SSR, no server functions. It's designed for **Cloudflare Pages**:

| Setting | Value |
| --- | --- |
| Root directory | *(leave empty — the repo root)* |
| Build command | `npm ci && npm --prefix demo ci && npm --prefix demo run build` |
| Output directory | `demo/dist` |

The build must run from the repo root: the demo bundles the package **source** (`../src`), whose own imports (`three`, `mediabunny`) resolve from the root `node_modules` — so both dependency trees must be installed.

Connect the GitHub repo in the Cloudflare Pages dashboard with those settings; every push to `main` then deploys automatically. `demo/public/_headers` adds immutable caching for the hashed assets. Any other static host (Netlify, Vercel, S3 + CDN, GitHub Pages) works just as well.

## Architecture

Two independent layers. The **playground** (`demo/`, React + Vite) renders the UI once and never touches the frame loop; the **engine** (`src/`, the `nyhmas` package) owns rendering and is entirely framework-agnostic. The demo consumes the package source through a Vite alias — exactly what a consumer gets from npm.

```
src/                     # the nyhmas package
  engine/
    Engine.ts            # owns renderer, the single rAF loop, quality, post-FX
    Renderer.ts          # WebGL2 wrapper (WebGPU-ready seam)
    Clock.ts             # SWAPPABLE time: LiveClock (playback) | FrameClock (export)
    Renderable.ts        # what the loop drives (scene + camera + update)
    smoothing.ts         # frame-rate-independent exponential smoothing
    quality/             # Capabilities + QualityManager (adaptive resolution)
    postfx/PostFX.ts     # shared composer: bloom + tonemap (OutputPass)
    audio/
      AudioEngine.ts     # WebAudio graph + play/pause/seek transport
      AudioFrame.ts      # shared per-frame payload: spectrum/waveform textures + bands
      AudioSource.ts     # interface: LiveAudioSource | OfflineAudioSource
      fft.ts             # radix-2 FFT for deterministic offline analysis
    effects/
      Effect.ts          # the effect contract + EngineContext
      Scene3DEffect.ts   # base class for 3D effects (the "3D host")
      ShaderEffect.ts    # base class for 2D fullscreen-shader effects (the "2D host")
      ParticleEffect.ts  # shared base for the point-cloud signature look
  effects/               # the library — one folder per effect (lazy-loaded)
    goldParticles/  orb/  galaxy/  aura/
  export/
    Recorder.ts          # Tier 1: captureStream + MediaRecorder
    OfflineRenderer.ts   # Tier 2: FrameClock + WebCodecs + mediabunny
    Compositor.ts        # burns overlay pixels into captured frames
  lib/
    registry.ts          # effect registry (dynamic imports → per-effect chunks)
    srt.ts               # SRT subtitle parsing for lyrics overlays
  index.ts               # public package surface (createVisualizer + building blocks)

demo/                    # the playground (React 19 + Vite + Tailwind)
  src/components/        # Liquid Glass UI: TopBar, Dropzone, TransportBar, …
  src/lib/
    AppController.ts     # wires engine + audio + DOM
    dialog.ts            # shared modal show/hide lifecycle
  src/styles/            # the design system (tokens.css) + component styles
  public/demo/track.mp3  # bundled demo track
```

### The engine loop

`Engine` runs one `requestAnimationFrame` loop. Each frame it: ticks the **Clock**, refreshes the **AudioSource**, calls `effect.update(dt, t, audioFrame)`, renders through the shared **PostFX** chain, and feeds the frame interval to the **QualityManager**, which nudges render resolution to hold the frame budget.

### Why "deterministic"?

Effects never call `performance.now()` or read a live analyser directly — time and audio arrive from the engine. That single rule is what makes high-quality export possible: for export we swap the `LiveClock` for a `FrameClock` (advances a fixed `1/fps` per frame) and the `LiveAudioSource` for an `OfflineAudioSource` (computes the spectrum for any timestamp via FFT). Every effect then renders identically and reproducibly, with no dropped frames — no per-effect changes required.

All smoothing (audio bands, particle easing, logo motion) is driven by frame-time **deltas**, not per-frame factors (`engine/smoothing.ts`), so motion looks the same on 120Hz displays, on slow frames, and in the fixed-step export.

## Adding an effect

Each effect is a folder under `src/effects/` exporting a class, plus one entry in [`src/lib/registry.ts`](src/lib/registry.ts). Point-cloud effects should extend `ParticleEffect` — it supplies the shared palette, uniforms, reaction smoothing, idle breathing, and beat response, so a new effect is just shaders + geometry + tuning (see `src/effects/orb/` for a minimal example).

**3D effect** — extend `Scene3DEffect`, implement `build` (create meshes) and `onUpdate` (react to the `AudioFrame`):

```ts
export class MyEffect extends Scene3DEffect {
  readonly meta = { id: 'my-effect', title: 'Mine', kind: '3d' as const };
  protected build(ctx) { /* add objects to this.scene */ }
  protected onUpdate(dt, t, audio) { /* react to audio.bands / audio.spectrum */ }
}
```

**2D effect** — extend `ShaderEffect` with a fragment shader; the shared audio (`uSpectrum`, `uWaveform`, `uBass`, `uMid`, `uTreble`, `uEnergy`, `uBeat`, `uTime`, `uResolution`) is wired automatically:

```ts
export class MyShader extends ShaderEffect {
  readonly meta = { id: 'my-shader', title: 'Mine', kind: '2d' as const };
  constructor(w: number, h: number) {
    super(w, h, /* glsl */ `... void main(){ ... }`);
    this.bloom = { strength: 1.0, radius: 0.9, threshold: 0.3, enabled: true };
  }
}
```

Register it with a dynamic import so it ships as its own chunk:

```ts
{
  meta: { id: 'my-effect', title: 'Mine', kind: '3d' },
  load: async () => {
    const { MyEffect } = await import('../effects/myEffect');
    return (w, h) => new MyEffect(w, h);
  },
}
```

## Video export

- **Record (Tier 1)** — `canvas.captureStream` + the WebAudio stream → `MediaRecorder`. Universal; quality follows real-time performance. The captured canvas is rAF-driven, so keep the tab visible while recording (background tabs freeze the video); the app warns if you switch away.
- **Fast render (Tier 2)** — renders every frame off the `FrameClock`, encodes H.264 + AAC via **WebCodecs**, and muxes an MP4 with `mediabunny`. No dropped frames, exact A/V sync, full resolution regardless of the live adaptive scale. Offered automatically where supported; Record is the fallback.

## Tech

React 19 · Vite · TypeScript · Three.js · Tailwind v4 · WebAudio · WebCodecs · Vitest · Biome.

## Roadmap

- Grow the effect library toward 100+ (2D shader art + 3D scenes).
- WebGPU backend via the isolated `Renderer` seam (WebGL2 stays the fallback).
- Per-effect parameters and presets; optional "story mode" overlays.
