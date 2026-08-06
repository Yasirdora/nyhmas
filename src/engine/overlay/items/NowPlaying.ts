import type { AudioFrame } from '../../audio/AudioFrame';
import { fadeWindow, type OverlayItem, type OverlayView } from '../OverlayItem';
import { drawLine } from '../text';

/**
 * "Now Playing" footer, bottom-left: a small tracked label over the track
 * name — the canvas port of the original's footer block. Fades in shortly
 * after the track starts and stays for the run of the song.
 */
export class NowPlaying implements OverlayItem {
  enabled = false;
  label = 'Now Playing';
  trackName = '';
  /** Horizontal shift (px) so the text sits beside the monogram when both are on. */
  offsetX = 0;

  /** In at ~3s like the original footer; effectively no fade-out. */
  timing = { start: 3.0, inDur: 1.5, outAt: Number.MAX_SAFE_INTEGER, outDur: 1 };

  get active(): boolean {
    return this.enabled && this.trackName.trim().length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    const t = frame.time;
    const { start, inDur, outAt, outDur } = this.timing;
    const alpha = fadeWindow(t, start, inDur, outAt, outDur);
    if (alpha <= 0.001) return;

    const margin = Math.max(24, view.w * 0.03);
    const x = margin + this.offsetX;
    const baseY = view.h - margin;

    ctx.globalAlpha = alpha;
    drawLine(ctx, this.label.toUpperCase(), x, baseY - 24, {
      size: 10,
      weight: 500,
      color: 'rgba(245,245,247,0.45)',
      letterSpacing: 2.4,
      align: 'left',
    });
    drawLine(ctx, this.trackName, x, baseY - 4, {
      size: 15,
      weight: 500,
      color: 'rgba(245,245,247,0.92)',
      letterSpacing: 0.4,
      align: 'left',
      glow: { color: 'rgba(255,255,255,0.18)', blur: 8 },
    });
    ctx.globalAlpha = 1;
  }
}
