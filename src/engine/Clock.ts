/**
 * Swappable time source.
 *
 * This is the linchpin of deterministic export. Every effect reads `dt` and
 * `t` from the engine, which reads them from a Clock — never from
 * `performance.now()` directly. During playback the engine uses a LiveClock
 * (wall-clock). During video export it swaps in a FrameClock that advances by
 * a fixed 1/fps step, so frame N always renders exactly `N/fps` seconds in —
 * no dropped frames, no wall-clock jitter, identical output every run.
 */
export interface Clock {
  /** Advance and return the delta and absolute time (seconds). */
  tick(nowMs: number): { dt: number; t: number };
  reset(): void;
  /** Absolute elapsed seconds. */
  readonly time: number;
}

/** Real-time clock driven by requestAnimationFrame timestamps. */
export class LiveClock implements Clock {
  private last = -1;
  private elapsed = 0;

  tick(nowMs: number): { dt: number; t: number } {
    const now = nowMs / 1000;
    if (this.last < 0) this.last = now;
    let dt = now - this.last;
    this.last = now;
    // Clamp large gaps (tab was backgrounded) so effects don't jump.
    if (dt > 0.1) dt = 0.1;
    this.elapsed += dt;
    return { dt, t: this.elapsed };
  }

  reset(): void {
    this.last = -1;
    this.elapsed = 0;
  }

  get time(): number {
    return this.elapsed;
  }
}

/**
 * Deterministic clock for offline (export) rendering. Ignores wall-clock time
 * entirely; each tick advances one fixed frame.
 */
export class FrameClock implements Clock {
  private frame = 0;

  constructor(private readonly fps: number) {}

  tick(): { dt: number; t: number } {
    const dt = 1 / this.fps;
    const t = this.frame / this.fps;
    this.frame++;
    return { dt, t };
  }

  reset(): void {
    this.frame = 0;
  }

  seekToFrame(frame: number): void {
    this.frame = frame;
  }

  get time(): number {
    return this.frame / this.fps;
  }
}
