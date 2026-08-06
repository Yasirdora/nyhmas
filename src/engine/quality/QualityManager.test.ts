import { describe, expect, it } from 'vitest';
import { QualityManager } from './QualityManager';

/** Feed `frames` frames of `ms` each, then return the manager. */
function feed(qm: QualityManager, ms: number, frames: number): void {
  for (let i = 0; i < frames; i++) qm.sample(ms);
}

function make() {
  const changes: number[] = [];
  const qm = new QualityManager({ onScaleChange: (s) => changes.push(s) });
  return { qm, changes };
}

describe('QualityManager', () => {
  it('starts at full scale and holds it on fast frames', () => {
    const { qm, changes } = make();
    feed(qm, 16.6, 600);
    expect(qm.currentScale).toBe(1);
    expect(changes).toHaveLength(0);
  });

  it('drops resolution stepwise when frames overrun the budget', () => {
    const { qm, changes } = make();
    feed(qm, 40, 10);
    expect(qm.currentScale).toBeLessThan(1);
    expect(changes[0]).toBeCloseTo(0.9, 5);
  });

  it('never drops below minScale, even under sustained overload', () => {
    const { qm } = make();
    feed(qm, 100, 2000);
    expect(qm.currentScale).toBe(0.5);
  });

  it('recovers to full scale after startup jank (no probe, no ceiling lock)', () => {
    // Regression: an early drop used to be misread as a failed upward probe,
    // permanently capping the session below full resolution.
    const { qm } = make();
    feed(qm, 40, 10); // janky boot → scale drops
    expect(qm.currentScale).toBeLessThan(1);
    feed(qm, 16.6, 3000); // smooth sailing → must climb all the way back
    expect(qm.currentScale).toBe(1);
  });

  it('locks the ceiling below a scale that failed right after probing up', () => {
    const { qm } = make();
    feed(qm, 40, 10); // drop to ~0.9, ceiling still 1 (no probe yet)
    // Recover in small bursts so we stop within 360 frames of the last probe.
    for (let i = 0; i < 40 && qm.currentScale < 1; i++) feed(qm, 16.6, 50);
    expect(qm.currentScale).toBe(1);
    // Fail the freshly probed level: feed slow frames until exactly one drop
    // lands (the post-probe cooldown makes a fixed count unreliable).
    let frames = 0;
    while (qm.currentScale === 1 && frames < 500) {
      qm.sample(40);
      frames++;
    }
    expect(qm.currentScale).toBeCloseTo(0.9, 5); // ceiling locked at 0.9
    feed(qm, 16.6, 5000); // headroom or not, never probe past the failed level
    expect(qm.currentScale).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('forceScale pins the scale and reopens probing', () => {
    const { qm, changes } = make();
    feed(qm, 100, 2000); // bottom out at 0.5
    qm.forceScale(1);
    expect(qm.currentScale).toBe(1);
    expect(changes[changes.length - 1]).toBe(1);
  });

  it('reports fps from the smoothed frame time', () => {
    const { qm } = make();
    feed(qm, 16.6667, 100);
    expect(qm.fps).toBeCloseTo(60, 0);
  });
});
