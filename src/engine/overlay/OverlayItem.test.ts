import { describe, expect, it } from 'vitest';
import { fadeWindow, smoothstep } from './OverlayItem';

describe('smoothstep', () => {
  it('clamps outside 0..1 and hits the endpoints', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });

  it('is 0.5 at the midpoint and monotonic', () => {
    expect(smoothstep(0.5)).toBe(0.5);
    let prev = 0;
    for (let x = 0.05; x <= 1; x += 0.05) {
      const v = smoothstep(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('fadeWindow', () => {
  // start 2s, 1s fade-in, out at 10s, 2s fade-out.
  const w = (t: number) => fadeWindow(t, 2, 1, 10, 2);

  it('is zero before the start and after the fade-out completes', () => {
    expect(w(0)).toBe(0);
    expect(w(2)).toBe(0);
    expect(w(12)).toBe(0);
    expect(w(99)).toBe(0);
  });

  it('eases in and out around a full-alpha hold', () => {
    expect(w(2.5)).toBeCloseTo(0.5, 5); // mid fade-in
    expect(w(5)).toBe(1); // hold
    expect(w(10)).toBe(1); // hold ends exactly at outAt
    expect(w(11)).toBeCloseTo(0.5, 5); // mid fade-out
  });

  it('never exceeds 1 even when the windows overlap', () => {
    // Degenerate: outAt before the fade-in finishes — min() must cap at 1.
    for (let t = 0; t < 3; t += 0.01) {
      const v = fadeWindow(t, 0, 2, 1, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
