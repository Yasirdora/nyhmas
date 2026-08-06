/** Shared engine types. */

export type QualityTier = 'low' | 'medium' | 'high';

export interface EngineStats {
  /** Smoothed frames per second. */
  fps: number;
  /** Current adaptive resolution scale (0..1 of base pixel ratio). */
  scale: number;
  /** Effective device pixel ratio in use. */
  pixelRatio: number;
}

export interface Size {
  w: number;
  h: number;
}
