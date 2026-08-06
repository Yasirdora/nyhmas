import type { AudioFrame } from './AudioFrame';

/**
 * A source of per-frame audio data. Two implementations:
 *   - LiveAudioSource   — reads a real-time AnalyserNode during playback.
 *   - OfflineAudioSource — precomputes FFT per frame for deterministic export.
 *
 * Effects only ever see the resulting AudioFrame, so swapping the source (live
 * ↔ offline) requires no effect changes.
 */
export interface AudioSource {
  readonly frame: AudioFrame;
  /** Refresh `frame` for absolute time `t` (seconds). Live sources ignore t. */
  update(t: number): void;
  dispose(): void;
}
