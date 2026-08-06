import { describe, expect, it } from 'vitest';
import { OfflineAudioSource } from './OfflineAudioSource';

/** Minimal AudioBuffer stand-in (Web Audio isn't available in Node). */
function mockBuffer(pcm: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    sampleRate,
    length: pcm.length,
    duration: pcm.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => pcm,
  } as unknown as AudioBuffer;
}

function tone(freq: number, seconds: number, sampleRate = 44100): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return pcm;
}

describe('OfflineAudioSource', () => {
  it('places the spectral peak at the tone frequency', () => {
    const sampleRate = 44100;
    const freq = 2000;
    const fftSize = 2048;
    const src = new OfflineAudioSource(
      mockBuffer(tone(freq, 0.5, sampleRate), sampleRate),
      fftSize,
    );

    src.update(0.25);
    const spec = src.frame.rawSpectrum;

    let maxBin = 0;
    let maxV = 0;
    for (let i = 0; i < spec.length; i++) {
      if (spec[i]! > maxV) {
        maxV = spec[i]!;
        maxBin = i;
      }
    }

    const expectedBin = Math.round((freq * fftSize) / sampleRate);
    expect(Math.abs(maxBin - expectedBin)).toBeLessThanOrEqual(2);
    expect(maxV).toBeGreaterThan(0);
  });

  it('is fully deterministic for the same timestamp', () => {
    const pcm = tone(300, 1.0);
    const a = new OfflineAudioSource(mockBuffer(pcm), 2048);
    const b = new OfflineAudioSource(mockBuffer(pcm), 2048);

    a.update(0.5);
    b.update(0.5);

    expect(Array.from(a.frame.rawSpectrum)).toEqual(Array.from(b.frame.rawSpectrum));
    expect(a.frame.bands.mid).toBeCloseTo(b.frame.bands.mid, 6);
  });

  it('reports a low-frequency tone as bass, not treble', () => {
    const src = new OfflineAudioSource(mockBuffer(tone(60, 0.5)), 2048);
    src.update(0.25);
    expect(src.frame.bands.bass).toBeGreaterThan(src.frame.bands.treble);
  });
});
