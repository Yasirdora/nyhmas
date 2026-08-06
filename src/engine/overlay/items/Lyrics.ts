import { type Cue, cueAt } from '../../../lib/srt';
import type { AudioFrame } from '../../audio/AudioFrame';
import { type OverlayItem, type OverlayView, smoothstep } from '../OverlayItem';
import { drawLine, wrapLines } from '../text';

/**
 * Synced lyrics from an SRT file: the active cue, centered in the lower third,
 * fading and rising in over the cue's first 0.35s and out over its last 0.35s.
 * A canvas port of the original's GSAP blur/scale transition — same feel,
 * fully deterministic (pure function of track time).
 */
export class Lyrics implements OverlayItem {
  cues: Cue[] = [];
  enabled = true;

  private readonly edge = 0.35; // fade duration at each end of a cue

  get active(): boolean {
    return this.enabled && this.cues.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    const t = frame.time;
    const cue = cueAt(this.cues, t);
    if (!cue) return;

    const inP = smoothstep((t - cue.start) / this.edge);
    const outP = smoothstep((cue.end - t) / this.edge);
    const alpha = Math.min(inP, outP);
    if (alpha <= 0.001) return;

    const rise = (1 - inP) * 12;
    const size = Math.min(Math.max(view.w * 0.024, 18), 30);
    const style = {
      size,
      weight: 600,
      color: 'rgba(255,255,255,0.94)',
      letterSpacing: size * 0.03,
      glow: { color: 'rgba(255,255,255,0.3)', blur: 18 },
    };

    ctx.globalAlpha = alpha;
    const lines = wrapLines(ctx, cue.text, view.w * 0.82, style);
    const lineH = size * 1.42;
    // Lower third, growing upward for multi-line cues.
    let y = view.h * 0.78 - (lines.length - 1) * lineH + rise;
    for (const line of lines) {
      drawLine(ctx, line, view.w / 2, y, style);
      y += lineH;
    }
    ctx.globalAlpha = 1;
  }
}
