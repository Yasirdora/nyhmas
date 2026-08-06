import type { AudioFrame } from '../../audio/AudioFrame';
import { fadeWindow, type OverlayItem, type OverlayView, smoothstep } from '../OverlayItem';
import { drawLine } from '../text';

/**
 * "Listen on" badge, top-right: helper text over a cycling brand row
 * (Spotify ↔ Apple Music). Brand marks are drawn from the original prototype's
 * SVG path data via Path2D; wordmarks are text (crisper at badge size than the
 * original's letter paths). The cycle is a pure function of track time.
 */

// Spotify circular mark — from the prototype's SpotifyWidget.astro (62×62 box).
const SPOTIFY_PATH =
  'M30.9861 0C13.8731 0 0 13.8718 0 30.9848C0 48.0978 13.8731 61.9709 30.9861 61.9709C48.0991 61.9709 61.9722 48.0978 61.9722 30.9848C61.9722 13.8718 48.0991 0 30.9861 0ZM26.4394 16.1717C35.5379 16.1717 45.1109 18.0433 52.1033 22.1503C53.0459 22.6841 53.7 23.489 53.7 24.9644C53.7 26.6535 52.3423 27.8673 50.7774 27.8673C50.1465 27.8673 49.7722 27.7139 49.1807 27.3901C43.5721 24.027 34.8685 22.1751 26.4512 22.1751C22.2494 22.1751 17.9819 22.6024 14.0729 23.6632C13.6227 23.7766 13.0538 24.0019 12.4841 24.0019C10.8312 24.0019 9.56285 22.6942 9.56285 21.0414C9.56285 19.3575 10.6065 18.4122 11.7322 18.0796C16.1493 16.7783 21.0797 16.1717 26.4394 16.1717ZM25.8078 26.8186C33.9184 26.8186 41.7646 28.8386 47.9332 32.5304C48.9674 33.1234 49.3481 33.8765 49.3481 34.9797C49.3481 36.3214 48.28 37.4054 46.9329 37.4054C46.2606 37.4054 45.8376 37.1337 45.3807 36.8679C40.3403 33.8767 33.3544 31.8897 25.7045 31.8897C21.7809 31.8897 18.3943 32.4391 15.5911 33.1856C14.9872 33.3518 14.6486 33.5308 14.0834 33.5308C12.7507 33.5308 11.6629 32.4448 11.6629 31.1012C11.6629 29.7835 12.302 28.8763 13.5904 28.5133C17.0736 27.5567 20.6306 26.8186 25.8078 26.8186ZM26.2328 36.9372C33.0133 36.9372 39.0563 38.4927 44.2561 41.6094C45.03 42.0613 45.484 42.523 45.484 43.669C45.484 44.786 44.5756 45.6069 43.5565 45.6069C43.0554 45.6069 42.7136 45.4331 42.245 45.148C37.7542 42.431 32.1548 41.0027 26.2119 41.0027C22.8963 41.0027 19.5594 41.4279 16.4385 42.0776C15.931 42.1876 15.2924 42.3836 14.9111 42.3836C13.7344 42.3836 12.9497 41.4489 12.9497 40.4365C12.9497 39.1344 13.7009 38.4861 14.6352 38.3076C18.4624 37.4354 22.2739 36.9372 26.2328 36.9372Z';

// Apple mark — from the prototype's AppleWidget.astro (drawn box ~152×190).
const APPLE_PATH =
  'M126.205 100.839C125.951 85.361 132.637 73.3122 146.246 64.6878C138.571 53.5268 127.251 47.2537 112.283 45.8512C106.959 45.3512 100.151 46.6098 91.8707 49.6585C82.9634 52.961 77.9488 54.6024 76.8366 54.6024C74.4854 54.6024 69.9707 53.2146 63.2805 50.4171C56.6049 47.6268 50.9098 46.2317 46.2073 46.2317C38.2902 46.361 30.9244 48.5488 24.122 52.7951C17.3171 57.0463 11.8756 62.8537 7.79512 70.2024C2.59268 79.339 0 90.2488 0 102.929C0 114.344 1.9122 125.756 5.74634 137.178C9.33415 148.088 13.9195 157.663 19.4805 165.9C24.4244 173.385 28.7707 178.839 32.4707 182.268C37.7976 187.593 43.2341 190.134 48.8098 189.876C52.3951 189.744 57.0927 188.415 62.9098 185.871C68.3488 183.473 73.7976 182.266 79.2439 182.266C84.3146 182.266 89.5683 183.466 95.0195 185.871C101.078 188.415 106.032 189.68 109.866 189.68C115.559 189.432 120.876 186.956 125.832 182.268C127.556 180.739 129.446 178.649 131.485 175.985C133.839 172.883 136.1 169.711 138.263 166.473C140.066 163.681 141.769 160.826 143.368 157.912C145.084 154.775 146.602 151.534 147.915 148.207C148.527 146.812 149.083 145.388 149.583 143.929C150.076 142.471 150.571 140.985 151.066 139.461C146.488 137.437 142.341 134.571 138.632 130.89C130.476 122.785 126.329 112.761 126.205 100.839ZM102.815 30.4439C109.376 22.1976 112.656 13.3195 112.656 3.80488V1.90488C112.656 1.26585 112.593 0.634146 112.471 0C107.89 0.253659 103.037 1.71463 97.8976 4.37317C92.7659 7.04146 88.5293 10.4073 85.1829 14.4585C78.5049 22.4561 75.161 31.0122 75.161 40.1463V41.9488C75.161 42.5244 75.2244 43.1244 75.3463 43.7634C85.6195 44.7756 94.7756 40.3341 102.815 30.4439Z';

interface Brand {
  name: string;
  path: Path2D;
  /** Source box of the path data. */
  box: { w: number; h: number };
  color: string;
}

const CYCLE = 12; // seconds per brand
const XFADE = 1; // crossfade duration

export class ListenBadge implements OverlayItem {
  enabled = false;
  helperText = 'listen for free on';
  showSpotify = true;
  showApple = true;

  /** Track-time envelope, matching the original header (in ~8s, out ~60s). */
  timing = { start: 8.0, inDur: 1.5, outAt: 60.0, outDur: 2.0 };

  private readonly brands: Brand[] = [
    {
      name: 'Spotify',
      path: new Path2D(SPOTIFY_PATH),
      box: { w: 62, h: 62 },
      color: '#8dc540',
    },
    {
      name: 'Apple Music',
      path: new Path2D(APPLE_PATH),
      box: { w: 152, h: 190 },
      color: '#f5f5f7',
    },
  ];

  get active(): boolean {
    return this.enabled;
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    const t = frame.time;
    const { start, inDur, outAt, outDur } = this.timing;
    const envelope = fadeWindow(t, start, inDur, outAt, outDur);
    if (envelope <= 0.001) return;

    const activeBrands = this.brands.filter(
      (b) =>
        (b.name === 'Spotify' && this.showSpotify) || (b.name === 'Apple Music' && this.showApple),
    );
    if (activeBrands.length === 0) return;

    // Which brand, and how far into its slot (for the crossfade).
    const local = Math.max(0, t - start);
    const slot = Math.floor(local / CYCLE);
    const slotT = local - slot * CYCLE;
    const brand = activeBrands[slot % activeBrands.length];
    // Fade in at slot start (except the very first), fade out at slot end.
    const fadeIn = slot === 0 ? 1 : smoothstep(slotT / XFADE);
    const fadeOut = smoothstep((CYCLE - slotT) / XFADE);
    const brandAlpha = Math.min(fadeIn, fadeOut);

    const margin = Math.max(24, view.w * 0.03);
    const right = view.w - margin;
    const top = margin;
    const iconH = 26;

    ctx.globalAlpha = envelope;

    // Helper text (small, dim, right-aligned).
    drawLine(ctx, this.helperText, right, top + 8, {
      size: 11,
      weight: 500,
      color: 'rgba(245,245,247,0.5)',
      letterSpacing: 2.2,
      align: 'right',
    });

    // Brand row: wordmark text with the mark to its left, right-aligned.
    ctx.globalAlpha = envelope * brandAlpha;
    const rowY = top + 34;
    const nameStyle = {
      size: 17,
      weight: 600 as const,
      color: '#f5f5f7',
      align: 'right' as CanvasTextAlign,
      glow: { color: 'rgba(255,255,255,0.2)', blur: 10 },
    };
    drawLine(ctx, brand.name, right, rowY, nameStyle);
    const nameW = ctx.measureText(brand.name).width;

    const scale = iconH / brand.box.h;
    const iconW = brand.box.w * scale;
    ctx.save();
    ctx.translate(right - nameW - iconW - 10, rowY - iconH / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = brand.color;
    ctx.fill(brand.path);
    ctx.restore();

    ctx.globalAlpha = 1;
  }
}
