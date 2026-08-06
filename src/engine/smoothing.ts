/**
 * Frame-rate-independent exponential smoothing.
 *
 * `current += (target - current) * f` — the classic per-frame lerp — runs at a
 * different effective speed on every refresh rate: twice as fast at 120Hz as at
 * 60Hz, slower on dropped frames. These helpers take `dt` instead, so motion is
 * identical on any display and, critically, identical between live playback and
 * the fixed-step offline renderer (whose exports must match what was previewed).
 *
 * Converting a factor tuned at 60fps: `rate = -60 * ln(1 - f)`.
 * At dt = 1/60 this reproduces the per-frame factor exactly, so retuned code is
 * pixel-identical at 60fps and simply *consistent* everywhere else.
 */

/** Largest dt the smoothing will integrate — longer gaps (tab switch, seek) snap. */
const MAX_DT = 0.1;

/** Move `current` toward `target` at `ratePerSec`. */
export function approach(current: number, target: number, ratePerSec: number, dt: number): number {
  if (dt <= 0) return current;
  const t = 1 - Math.exp(-ratePerSec * Math.min(dt, MAX_DT));
  return current + (target - current) * t;
}

/** Decay `value` toward zero at `ratePerSec` (e.g. beat pulses). */
export function decay(value: number, ratePerSec: number, dt: number): number {
  if (dt <= 0) return value;
  return value * Math.exp(-ratePerSec * Math.min(dt, MAX_DT));
}
