/**
 * Adaptive resolution controller — the single biggest lever for staying smooth
 * on mid-range hardware.
 *
 * It watches a smoothed frame time (EMA) against a target budget (default
 * ~16.6ms = 60fps). When the average slips over budget it drops the render
 * resolution scale; when there's comfortable headroom it eases the scale back
 * up. Cooldowns prevent oscillation, and steps are asymmetric — quick to
 * protect framerate, slow to spend headroom.
 */
export interface QualityManagerOptions {
  budgetMs?: number;
  minScale?: number;
  maxScale?: number;
  onScaleChange: (scale: number) => void;
}

export class QualityManager {
  private readonly budgetMs: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly onScaleChange: (scale: number) => void;

  private ema: number;
  private scale = 1;
  private cooldown = 0;
  /** Highest scale we're allowed to probe toward (lowered after failed probes). */
  private probeCeiling: number;
  /**
   * Frames since the last upward probe (to attribute drops to probes). Stays
   * at Infinity until the first real probe — otherwise early startup jank
   * (font loads, shader compiles) would look like a failed probe and lock the
   * ceiling below full resolution for the whole session.
   */
  private sinceProbe = Number.POSITIVE_INFINITY;

  constructor(options: QualityManagerOptions) {
    this.budgetMs = options.budgetMs ?? 1000 / 60;
    this.minScale = options.minScale ?? 0.5;
    this.maxScale = options.maxScale ?? 1;
    this.onScaleChange = options.onScaleChange;
    this.ema = this.budgetMs;
    this.scale = this.maxScale;
    this.probeCeiling = this.maxScale;
  }

  /**
   * Feed one frame's interval (ms, from rAF timestamps).
   *
   * Interval — not main-thread work time — is the signal, because the real
   * bottleneck here is GPU fill rate (bloom/overdraw), which the CPU clock
   * can't see: a GPU-bound frame delays the next rAF, inflating the interval.
   * Under vsync a frame with headroom still reports ~16.6ms, so we can't
   * detect spare capacity directly — instead we *probe* upward whenever we're
   * steadily hitting the target, and back off if a step pushes us over budget.
   */
  sample(frameMs: number): void {
    this.ema = this.ema * 0.9 + frameMs * 0.1;
    // Infinity + 1 is still Infinity — "no probe yet" never ages into "recent".
    this.sinceProbe++;

    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    if (this.ema > this.budgetMs * 1.2 && this.scale > this.minScale) {
      // Clearly missing the target — drop resolution to recover fast.
      this.scale = Math.max(this.minScale, this.scale - 0.1);
      // If this drop follows a recent upward probe, that level is beyond the
      // machine: lock the ceiling at the recovered level so we never oscillate
      // (each oscillation resizes the canvas buffer = a visible hitch).
      if (this.sinceProbe < 360) this.probeCeiling = this.scale;
      this.onScaleChange(this.scale);
      this.cooldown = 45; // ~0.75s before reacting again
    } else if (this.ema < this.budgetMs * 1.05 && this.scale + 0.05 <= this.probeCeiling + 1e-6) {
      // Comfortably at target — probe upward slowly, but never past a level
      // that already failed. Resizes are rare by construction.
      this.scale = Math.min(this.probeCeiling, this.scale + 0.05);
      this.sinceProbe = 0;
      this.onScaleChange(this.scale);
      this.cooldown = 120; // spend headroom cautiously (~2s)
    }
  }

  get currentScale(): number {
    return this.scale;
  }

  get fps(): number {
    return 1000 / this.ema;
  }

  /** Pin the scale (used during offline export, where we want max quality). */
  forceScale(scale: number): void {
    this.scale = scale;
    this.probeCeiling = this.maxScale; // fresh context, allow re-probing
    this.sinceProbe = Number.POSITIVE_INFINITY;
    this.onScaleChange(scale);
  }
}
