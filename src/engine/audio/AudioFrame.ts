import * as THREE from 'three';
import { approach, decay } from '../smoothing';

/**
 * Reduced perceptual bands (0..1), derived from the raw spectrum each frame.
 * Effects can read these scalars directly for quick reactions, or sample the
 * full `spectrum`/`waveform` textures in-shader for detail.
 */
export interface AudioBands {
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  /** Overall loudness (mean magnitude). */
  energy: number;
  /** Decaying transient pulse (0..1), spikes on bass onsets. */
  beat: number;
}

/** Frequency band edges in Hz. */
const BANDS: Array<[keyof AudioBands, number, number]> = [
  ['bass', 20, 140],
  ['lowMid', 140, 400],
  ['mid', 400, 1600],
  ['highMid', 1600, 4000],
  ['treble', 4000, 14000],
];

/**
 * Per-second smoothing rates — the dt-based equivalents of the original
 * per-frame factors at 60fps (rate = -60·ln(1-f)), so the response is identical
 * on any refresh rate and matches the fixed-step offline export exactly at 60fps.
 */
const BAND_RATE = -60 * Math.log(0.4); // was: bands × 0.4 + value × 0.6 per frame
const BASS_EMA_RATE = -60 * Math.log(0.92); // was: ema × 0.92 + bass × 0.08
const BEAT_DECAY_RATE = -60 * Math.log(0.88); // was: beat × 0.88 per frame

/**
 * The per-frame audio payload shared with every effect. One instance is owned
 * by the active AudioSource; effects receive it (never a raw analyser), which
 * is what lets the offline exporter feed identical data deterministically.
 *
 * The spectrum/waveform live in R8 DataTextures (bin/sample along X) so shaders
 * can sample them cheaply. `rawSpectrum`/`rawWaveform` are written in-place by
 * the source (e.g. `analyser.getByteFrequencyData(frame.rawSpectrum)`), then
 * `commit()` recomputes bands and flags the textures for upload — zero copies.
 */
export class AudioFrame {
  readonly spectrum: THREE.DataTexture;
  readonly waveform: THREE.DataTexture;
  readonly rawSpectrum: Uint8Array<ArrayBuffer>;
  readonly rawWaveform: Uint8Array<ArrayBuffer>;
  readonly bands: AudioBands = {
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    treble: 0,
    energy: 0,
    beat: 0,
  };

  time = 0;
  duration = 0;
  /** Context sample rate (Hz) — lets effects map FFT bins to frequencies. */
  sampleRate = 0;

  private bassEma = 0;
  private midEma = 0;
  private lastCommitTime: number | null = null;

  constructor(
    readonly binCount: number,
    readonly sampleCount: number = binCount,
  ) {
    this.rawSpectrum = new Uint8Array(binCount);
    this.rawWaveform = new Uint8Array(sampleCount);

    this.spectrum = AudioFrame.makeTexture(this.rawSpectrum, binCount);
    this.waveform = AudioFrame.makeTexture(this.rawWaveform, sampleCount);
    // Waveform is centered at 128 (silence); pre-fill so it reads as flat.
    this.rawWaveform.fill(128);
  }

  private static makeTexture(data: Uint8Array<ArrayBuffer>, width: number): THREE.DataTexture {
    const tex = new THREE.DataTexture(data, width, 1, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Recompute bands from the current raw arrays and flag textures for upload.
   * @param sampleRate audio context sample rate
   * @param fftSize analyser fftSize (bins = fftSize / 2)
   */
  commit(sampleRate: number, fftSize: number, time: number, duration: number): void {
    // dt drives all smoothing so the response is refresh-rate independent (see
    // the rate constants above). The first frame assumes one 60fps step.
    const dt =
      this.lastCommitTime === null
        ? 1 / 60
        : Math.min(0.1, Math.max(0, time - this.lastCommitTime));
    this.lastCommitTime = time;

    this.time = time;
    this.duration = duration;
    this.sampleRate = sampleRate;

    const hzPerBin = sampleRate / fftSize;

    let energySum = 0;
    for (let i = 0; i < this.rawSpectrum.length; i++) energySum += this.rawSpectrum[i]!;
    this.bands.energy = energySum / (this.rawSpectrum.length * 255);

    for (const [name, fromHz, toHz] of BANDS) {
      const from = Math.max(0, Math.floor(fromHz / hzPerBin));
      const to = Math.min(this.rawSpectrum.length - 1, Math.ceil(toHz / hzPerBin));
      let sum = 0;
      let n = 0;
      for (let i = from; i <= to; i++) {
        sum += this.rawSpectrum[i]!;
        n++;
      }
      const value = n > 0 ? sum / (n * 255) : 0;
      // Light smoothing on top of the analyser's own smoothingTimeConstant.
      this.bands[name] = approach(this.bands[name], value, BAND_RATE, dt);
    }

    // Onset-based beat pulse: fires when bass (kick) or mid (snare/clap) jumps
    // above its recent average, then decays over ~300ms. Listening to two
    // bands is what makes the pulse feel rhythm-aware, not just kick-aware.
    const { bass, mid } = this.bands;
    this.bassEma = approach(this.bassEma, bass, BASS_EMA_RATE, dt);
    this.midEma = approach(this.midEma, mid, BASS_EMA_RATE, dt);
    const bassOnset = Math.max(0, bass - this.bassEma * 1.28);
    const midOnset = Math.max(0, mid - this.midEma * 1.4);
    const onset = Math.min(1, bassOnset * 6 + midOnset * 4);
    this.bands.beat = Math.max(decay(this.bands.beat, BEAT_DECAY_RATE, dt), onset);

    this.spectrum.needsUpdate = true;
    this.waveform.needsUpdate = true;
  }

  /** Reset to silence (e.g. on stop). */
  silence(): void {
    this.rawSpectrum.fill(0);
    this.rawWaveform.fill(128);
    this.spectrum.needsUpdate = true;
    this.waveform.needsUpdate = true;
    this.bassEma = 0;
    this.midEma = 0;
    this.lastCommitTime = null;
    for (const key of Object.keys(this.bands) as Array<keyof AudioBands>) {
      this.bands[key] = 0;
    }
  }

  get progress(): number {
    return this.duration > 0 ? this.time / this.duration : 0;
  }

  dispose(): void {
    this.spectrum.dispose();
    this.waveform.dispose();
  }
}
