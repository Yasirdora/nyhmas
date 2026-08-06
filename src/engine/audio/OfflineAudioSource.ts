import { AudioFrame } from './AudioFrame';
import type { AudioSource } from './AudioSource';
import { blackman, fft } from './fft';

/**
 * Deterministic audio source for offline (export) rendering.
 *
 * Instead of a real-time AnalyserNode, it precomputes a mono PCM mixdown from
 * the decoded buffer and, for any time `t`, runs a windowed FFT over the sample
 * window at that position. It mirrors AnalyserNode behaviour closely: the same
 * bin count, the spec's Blackman window, and the analyser's exponential magnitude
 * smoothing (`smoothingTimeConstant`) applied across successive frames — so an
 * exported frame looks like the live frame at the same timestamp.
 *
 * Because frame N always maps to t = N/fps and the smoothing state advances
 * monotonically, rendering is fully reproducible.
 */
export class OfflineAudioSource implements AudioSource {
  readonly frame: AudioFrame;

  private readonly pcm: Float32Array;
  private readonly sampleRate: number;
  private readonly fftSize: number;
  private readonly binCount: number;
  private readonly window: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly smoothed: Float32Array;
  private readonly duration: number;

  constructor(
    buffer: AudioBuffer,
    fftSize = 2048,
    private readonly smoothing = 0.7,
  ) {
    this.fftSize = fftSize;
    this.binCount = fftSize >> 1;
    this.sampleRate = buffer.sampleRate;
    this.duration = buffer.duration;
    this.frame = new AudioFrame(this.binCount, fftSize);

    this.pcm = OfflineAudioSource.toMono(buffer);
    this.window = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) this.window[i] = blackman(i, fftSize);
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.smoothed = new Float32Array(this.binCount);
  }

  update(t: number): void {
    const start = Math.floor(t * this.sampleRate);

    // Windowed copy of the sample block into the FFT input.
    for (let i = 0; i < this.fftSize; i++) {
      const s = this.pcm[start + i] ?? 0;
      this.re[i] = s * this.window[i]!;
      this.im[i] = 0;
    }

    fft(this.re, this.im);

    // Mirror AnalyserNode's getByteFrequencyData exactly: scale by 1/fftSize,
    // smooth in the LINEAR domain (smoothingTimeConstant), convert to dB, then
    // map the -100..-30 dB default range onto 0..255. This is what makes the
    // rendered export react identically to live playback.
    const scale = 1 / this.fftSize;
    const minDb = -100;
    const maxDb = -30;
    const spectrum = this.frame.rawSpectrum;
    for (let k = 0; k < this.binCount; k++) {
      const mag = Math.hypot(this.re[k]!, this.im[k]!) * scale;
      const sm = this.smoothing * this.smoothed[k]! + (1 - this.smoothing) * mag;
      this.smoothed[k] = sm;
      const db = 20 * Math.log10(sm + 1e-20);
      const v = ((db - minDb) / (maxDb - minDb)) * 255;
      spectrum[k] = v > 255 ? 255 : v < 0 ? 0 : v | 0;
    }

    // Waveform: raw samples mapped to 0..255 (128 = silence).
    const wave = this.frame.rawWaveform;
    for (let i = 0; i < this.fftSize; i++) {
      const s = this.pcm[start + i] ?? 0;
      const v = 128 + s * 127;
      wave[i] = v > 255 ? 255 : v < 0 ? 0 : v | 0;
    }

    this.frame.commit(this.sampleRate, this.fftSize, t, this.duration);
  }

  dispose(): void {
    this.frame.dispose();
  }

  private static toMono(buffer: AudioBuffer): Float32Array {
    const n = buffer.length;
    const out = new Float32Array(n);
    const channels = buffer.numberOfChannels;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) out[i]! += data[i]! / channels;
    }
    return out;
  }
}
