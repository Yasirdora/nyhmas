import type { AudioFrame } from '../audio/AudioFrame';

/** Viewport info for overlay drawing, in CSS pixels (ctx is pre-scaled by dpr). */
export interface OverlayView {
  w: number;
  h: number;
  dpr: number;
}

/**
 * A drawable overlay element (title card, lyrics line, badge, logo…).
 *
 * Determinism rule: draw() must be a pure function of the AudioFrame's time
 * (plus its own static config) — no wall-clock, no rAF-driven tween libraries.
 * That's what makes overlays render identically live, while recording, and
 * during deterministic Fast render.
 */
export interface OverlayItem {
  /** False when the item has nothing to draw (lets the layer skip work). */
  readonly active: boolean;
  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void;
}

/** 0→1 ease with smooth ends (Hermite). */
export function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * Alpha envelope for a timed element: eases in over `inDur` starting at
 * `start`, holds, then eases out over `outDur` starting at `outAt`.
 */
export function fadeWindow(
  t: number,
  start: number,
  inDur: number,
  outAt: number,
  outDur: number,
): number {
  if (t <= start) return 0;
  if (t >= outAt + outDur) return 0;
  const fadeIn = smoothstep((t - start) / inDur);
  const fadeOut = 1 - smoothstep((t - outAt) / outDur);
  return Math.min(fadeIn, fadeOut);
}

export const OVERLAY_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif';
