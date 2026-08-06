import { describe, expect, it } from 'vitest';
import { fft } from './fft';

describe('fft', () => {
  it('peaks at the input frequency bin for a pure cosine', () => {
    const N = 64;
    const k = 5;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * k * i) / N);

    fft(re, im);

    let maxBin = 0;
    let maxMag = 0;
    for (let i = 0; i < N / 2; i++) {
      const m = Math.hypot(re[i]!, im[i]!);
      if (m > maxMag) {
        maxMag = m;
        maxBin = i;
      }
    }
    expect(maxBin).toBe(k);
  });

  it('transforms a unit impulse to a flat spectrum', () => {
    const N = 16;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    re[0] = 1;

    fft(re, im);

    for (let i = 0; i < N; i++) {
      expect(Math.hypot(re[i]!, im[i]!)).toBeCloseTo(1, 5);
    }
  });

  it('is deterministic', () => {
    const N = 32;
    const re1 = new Float32Array(N);
    for (let i = 0; i < N; i++) re1[i] = Math.sin(i) + 0.3 * Math.cos(3 * i);
    const re2 = Float32Array.from(re1);
    const im1 = new Float32Array(N);
    const im2 = new Float32Array(N);

    fft(re1, im1);
    fft(re2, im2);

    expect(Array.from(re1)).toEqual(Array.from(re2));
    expect(Array.from(im1)).toEqual(Array.from(im2));
  });
});
