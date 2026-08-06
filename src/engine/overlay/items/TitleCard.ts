import type { AudioFrame } from '../../audio/AudioFrame';
import { fadeWindow, type OverlayItem, type OverlayView, smoothstep } from '../OverlayItem';
import { drawLine, wrapLines } from '../text';

/**
 * Opening title card: subtitle eyebrow + main title, centered. Timing follows
 * the original's cinematic sequence (title visible roughly 2s→12s of track
 * time), eased in/out, with a gentle rise on entry. NYHMAS-native styling:
 * white with a soft glow, wide-tracked uppercase subtitle.
 */
export class TitleCard implements OverlayItem {
  title = '';
  subtitle = '';
  enabled = true;

  /** Track-time envelope (seconds); tuned to the original's sequence. */
  timing = { start: 2.0, inDur: 1.4, outAt: 12.0, outDur: 2.0 };

  get active(): boolean {
    return this.enabled && (this.title.trim().length > 0 || this.subtitle.trim().length > 0);
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    const t = frame.time;
    const { start, inDur, outAt, outDur } = this.timing;
    const alpha = fadeWindow(t, start, inDur, outAt, outDur);
    if (alpha <= 0.001) return;

    // Gentle rise while fading in.
    const rise = (1 - smoothstep((t - start) / inDur)) * 14;
    const cx = view.w / 2;
    const cy = view.h / 2 + rise;

    ctx.globalAlpha = alpha;

    const titleSize = Math.min(view.w * 0.052, 54);
    let y = cy;

    if (this.subtitle.trim()) {
      drawLine(ctx, this.subtitle.trim().toUpperCase(), cx, y - titleSize * 0.95, {
        size: Math.max(11, titleSize * 0.2),
        weight: 500,
        color: 'rgba(245,245,247,0.62)',
        letterSpacing: titleSize * 0.16,
        glow: { color: 'rgba(255,255,255,0.25)', blur: 12 },
      });
    }

    if (this.title.trim()) {
      const style = {
        size: titleSize,
        weight: 600,
        color: '#ffffff',
        letterSpacing: titleSize * 0.06,
        glow: { color: 'rgba(255,255,255,0.35)', blur: 28 },
      };
      const lines = wrapLines(ctx, this.title.trim(), view.w * 0.86, style);
      for (const line of lines) {
        drawLine(ctx, line, cx, y, style);
        y += titleSize * 1.18;
      }
    }

    ctx.globalAlpha = 1;
  }
}
