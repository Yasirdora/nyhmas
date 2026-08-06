import type { AudioFrame } from '../../audio/AudioFrame';
import { type OverlayItem, type OverlayView, smoothstep } from '../OverlayItem';
import {
  DOT_CENTER,
  DOT_RED_TARGET,
  DOT_WHITE_TARGET,
  MONO_BOX,
  MONO_RED,
  MONO_RED_COLOR,
  MONO_RED_LEN,
  MONO_STROKE,
  MONO_WHITE,
  MONO_WHITE_LEN,
} from './monogramPaths';

/**
 * The finale: in the track's last ~10 seconds, two dots appear at center,
 * travel outward, and the monogram draws on between them — the original's
 * end-logo sequence re-expressed as a pure function of remaining time
 * (frame.duration − frame.time), so it lands identically in exports.
 */

const LEAD = 10; // seconds before the end when the reveal starts
const DOT_R = 11;

export class EndReveal implements OverlayItem {
  enabled = false;
  /** Dev-only: pin the local sequence time (null = follow the track). */
  forceTau: number | null = null;

  private readonly white = new Path2D(MONO_WHITE);
  private readonly red = new Path2D(MONO_RED);

  get active(): boolean {
    return this.enabled;
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    let tau: number;
    if (this.forceTau !== null) {
      tau = this.forceTau;
    } else {
      // Needs a real duration; skip for very short clips.
      if (frame.duration < LEAD * 2) return;
      tau = frame.time - (frame.duration - LEAD);
    }
    if (tau <= 0) return;

    const appear = smoothstep(tau / 0.5); // dots pop in
    const travel = smoothstep((tau - 0.5) / 1.2); // dots move outward
    const drawn = smoothstep((tau - 1.7) / 1.5); // paths draw on
    const settle = 1 + (1 - smoothstep((tau - 3.2) / 1.2)) * 0.02; // tiny settle
    const pulse = 1 + frame.bands.bass ** 3 * 0.02;

    // End-card proportion: a logo should sign off, not shout — keep it to
    // about a quarter of the frame, capped at 180px for large screens.
    const height = Math.min(view.h * 0.24, 180);
    const scale = (height / MONO_BOX.h) * settle * pulse;

    ctx.globalAlpha = appear;
    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-MONO_BOX.w / 2, -MONO_BOX.h / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = MONO_STROKE;

    // Paths draw on between the dots.
    if (drawn > 0) {
      ctx.setLineDash([MONO_WHITE_LEN]);
      ctx.lineDashOffset = (1 - drawn) * MONO_WHITE_LEN;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255,255,255,0.25)';
      ctx.shadowBlur = 15;
      ctx.stroke(this.white);

      ctx.setLineDash([MONO_RED_LEN]);
      ctx.lineDashOffset = (1 - drawn) * MONO_RED_LEN;
      ctx.strokeStyle = MONO_RED_COLOR;
      ctx.shadowColor = 'rgba(226,29,41,0.6)';
      ctx.shadowBlur = 15;
      ctx.stroke(this.red);
      ctx.setLineDash([]);
    }

    // The travelling dots.
    const rx = DOT_CENTER.x + (DOT_RED_TARGET.x - DOT_CENTER.x) * travel;
    const ry = DOT_CENTER.y + (DOT_RED_TARGET.y - DOT_CENTER.y) * travel;
    const wx = DOT_CENTER.x + (DOT_WHITE_TARGET.x - DOT_CENTER.x) * travel;
    const wy = DOT_CENTER.y + (DOT_WHITE_TARGET.y - DOT_CENTER.y) * travel;

    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    dot(ctx, wx, wy, DOT_R * appear);
    ctx.shadowColor = 'rgba(226,29,41,0.6)';
    ctx.fillStyle = MONO_RED_COLOR;
    dot(ctx, rx, ry, DOT_R * appear);

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
