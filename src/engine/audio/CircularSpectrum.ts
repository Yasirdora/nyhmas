import * as THREE from 'three';
import { approach } from '../smoothing';
import type { AudioFrame } from './AudioFrame';

/**
 * Circular spectrum envelope: the FFT folded into this many log-spaced points
 * around a circle, with punchy ~20ms attack and graceful ~290ms release so
 * motion travels like liquid instead of jittering.
 */
const POINTS = 64;
/** Analysis window: the musical part of the spectrum. */
const FREQ_MIN = 30; // Hz
const FREQ_MAX = 14_000; // Hz
/** Log-map exponent: >1 gives the bass region fine angular resolution. */
const LOG_GAMMA = 2.2;
const ATTACK_RATE = 50;
const RELEASE_RATE = 3.5;

/**
 * The spectrum expressed around a circle (0..1), uploaded each frame as an
 * R8 texture with RepeatWrapping so sampling at any longitude is seamless.
 * Shared by effects that map audio onto an angle (Orb's bulges, Galaxy's
 * arms). Deterministic: derived only from the AudioFrame and dt, so offline
 * exports reproduce the exact motion.
 */
export class CircularSpectrum {
  readonly texture: THREE.DataTexture;
  private readonly levels = new Float32Array(POINTS);
  private readonly bytes = new Uint8Array(POINTS);

  constructor() {
    this.texture = new THREE.DataTexture(
      this.bytes,
      POINTS,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    // Repeat on S: the envelope is circular, so the seam filters smoothly.
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
  }

  /** Fold the current FFT frame into the envelope and flag it for upload. */
  update(dt: number, audio: AudioFrame): void {
    const raw = audio.rawSpectrum;
    const binHz = (audio.sampleRate || 44_100) / (raw.length * 2);
    const minBin = Math.max(1, Math.floor(FREQ_MIN / binHz));
    const maxBin = Math.min(raw.length - 1, Math.ceil(FREQ_MAX / binHz));

    for (let i = 0; i < POINTS; i++) {
      const b0 = Math.min(
        maxBin,
        Math.floor(minBin + (i / POINTS) ** LOG_GAMMA * (maxBin - minBin)),
      );
      const b1 = Math.min(
        maxBin,
        Math.max(b0 + 1, Math.ceil(minBin + ((i + 1) / POINTS) ** LOG_GAMMA * (maxBin - minBin))),
      );
      let sum = 0;
      for (let b = b0; b <= b1; b++) sum += raw[b]!;
      // Gentle high-shelf compensation: treble energy reads lower on meters.
      const v = (sum / ((b1 - b0 + 1) * 255)) * (0.85 + 0.5 * (i / POINTS));
      const target = Math.min(1, v) ** 1.25;
      const rate = target > this.levels[i]! ? ATTACK_RATE : RELEASE_RATE;
      this.levels[i] = approach(this.levels[i]!, target, rate, dt);
      this.bytes[i] = Math.round(this.levels[i]! * 255);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
