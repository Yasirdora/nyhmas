/**
 * NYHMAS — audio-reactive particle visualizers.
 *
 * The public package surface. Quick start:
 *
 * ```ts
 * import { createVisualizer } from 'nyhmas';
 *
 * const viz = await createVisualizer(document.getElementById('stage')!, {
 *   effect: 'aura', // 'gold-particles' | 'orb' | 'galaxy' | 'aura'
 * });
 * viz.start();
 * await viz.loadTrack(file); // File, Blob, or ArrayBuffer
 * await viz.play();
 * ```
 *
 * The container must have a CSS size and non-static positioning (the canvas
 * mounts absolutely inside it). Everything is deterministic: time and audio
 * arrive per frame, so offline exporters can reproduce any render exactly.
 */

import { AudioEngine } from './engine/audio/AudioEngine';
import { LiveAudioSource } from './engine/audio/LiveAudioSource';
import type { EngineOptions } from './engine/Engine';
import { Engine } from './engine/Engine';
import { DEFAULT_EFFECT_ID, getEntry } from './lib/registry';

// ---- Audio -----------------------------------------------------------------
export { AudioEngine } from './engine/audio/AudioEngine';
export { type AudioBands, AudioFrame } from './engine/audio/AudioFrame';
export type { AudioSource } from './engine/audio/AudioSource';
export { CircularSpectrum } from './engine/audio/CircularSpectrum';
export { LiveAudioSource } from './engine/audio/LiveAudioSource';
export { OfflineAudioSource } from './engine/audio/OfflineAudioSource';
export { type Clock, FrameClock, LiveClock } from './engine/Clock';
// ---- Engine core -----------------------------------------------------------
export { Engine, type EngineOptions } from './engine/Engine';
export type { Effect, EffectMeta, EngineContext } from './engine/effects/Effect';
export { ParticleEffect, type ParticleEffectConfig } from './engine/effects/ParticleEffect';
export { Scene3DEffect, type Scene3DOptions } from './engine/effects/Scene3DEffect';
export { ShaderEffect } from './engine/effects/ShaderEffect';
export { EndReveal } from './engine/overlay/items/EndReveal';
export { ListenBadge } from './engine/overlay/items/ListenBadge';
export { Lyrics } from './engine/overlay/items/Lyrics';
export { Monogram } from './engine/overlay/items/Monogram';
export { NowPlaying } from './engine/overlay/items/NowPlaying';
export { TitleCard } from './engine/overlay/items/TitleCard';
export type { OverlayItem, OverlayView } from './engine/overlay/OverlayItem';
// ---- Overlay (titles, lyrics, branding) ------------------------------------
export { OverlayLayer } from './engine/overlay/OverlayLayer';
export { type BloomConfig, DEFAULT_BLOOM, PostFX } from './engine/postfx/PostFX';
export type { Renderable } from './engine/Renderable';
export { Renderer } from './engine/Renderer';
export type { EngineStats, QualityTier } from './engine/types';
// ---- Export (video) ---------------------------------------------------------
export { Compositor } from './export/Compositor';
export {
  OfflineRenderer,
  type OfflineRenderOptions,
  offlineExportSupported,
} from './export/OfflineRenderer';
export { downloadBlob, Recorder, type RecorderOptions, recommendedVideoBitrate } from './export/Recorder';
// ---- Effects ---------------------------------------------------------------
export {
  DEFAULT_EFFECT_ID,
  EFFECTS,
  type EffectEntry,
  type EffectFactory,
  getEntry,
} from './lib/registry';
export { type Cue, parseSrt } from './lib/srt';

// ---- Convenience API --------------------------------------------------------

export interface VisualizerOptions extends EngineOptions {
  /** Effect id to start on (see EFFECTS; default: the registry default). */
  effect?: string;
  /** Analyser FFT size (default 2048). */
  fftSize?: number;
}

export interface Visualizer {
  readonly engine: Engine;
  readonly audio: AudioEngine;
  /** Switch the active effect by id (see EFFECTS). */
  setEffect(id: string): Promise<void>;
  /** Decode and load a track: File, Blob, or ArrayBuffer. */
  loadTrack(data: File | Blob | ArrayBuffer): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  /** Start/stop the render loop (independent of audio transport). */
  start(): void;
  stop(): void;
  dispose(): void;
}

/**
 * Wire an Engine, an AudioEngine and a live analyser source into one handle,
 * with the requested effect mounted. The container needs a CSS size and
 * non-static positioning. `start()` must be called to run the render loop;
 * the visuals idle-breathe even before a track is loaded.
 */
export async function createVisualizer(
  container: HTMLElement,
  options: VisualizerOptions = {},
): Promise<Visualizer> {
  const engine = new Engine(container, options);
  const audio = new AudioEngine(options.fftSize);
  engine.setAudioSource(new LiveAudioSource(audio));

  const mount = async (id: string): Promise<void> => {
    const entry = getEntry(id);
    const factory = await entry.load();
    const { width, height } = engine.getSize();
    await engine.mountEffect(factory(width, height));
  };
  await mount(getEntry(options.effect ?? DEFAULT_EFFECT_ID).meta.id);

  return {
    engine,
    audio,
    setEffect: mount,
    loadTrack: async (data) => {
      const bytes = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
      audio.setBuffer(await audio.decode(bytes));
    },
    play: () => audio.play(),
    pause: () => audio.pause(),
    start: () => engine.start(),
    stop: () => engine.stop(),
    dispose: () => {
      engine.dispose();
      audio.dispose();
    },
  };
}
