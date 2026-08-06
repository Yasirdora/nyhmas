/**
 * The brand monogram's geometry, ported from the original prototype's
 * FooterLogo/EndLogo SVGs (272×346 viewBox). Shared by the Monogram footer
 * item and the EndReveal finale.
 */

export const MONO_BOX = { w: 272, h: 346 } as const;

/** White stroke path (source stroke-width 22, round caps/joins). */
export const MONO_WHITE =
  'M181.847 116.404 V79.1532 L209.291 51.7091 C228.373 32.6272 261 46.1418 261 73.1276 V272.794 C261 299.78 228.373 313.295 209.291 294.213 L90.5508 175.473 V225.805';

/** Red stroke path. */
export const MONO_RED =
  'M90.1533 266.769L62.7092 294.213C43.6273 313.295 11.0003 299.78 11.0003 272.794V73.1275C11.0003 46.1416 43.6273 32.6271 62.7092 51.709L181.449 170.449L165.974 185.924';

export const MONO_STROKE = 22;
export const MONO_RED_COLOR = '#E21D29';

/** The 4 visualizer bars: x positions at y=165, 16×16 rounded (r=8). */
export const BAR_XS = [83, 113, 143, 173] as const;
export const BAR_W = 16;
export const BAR_CENTER_Y = 173;

/** End-reveal dot travel targets (from the original's end sequence). */
export const DOT_CENTER = { x: 136, y: 173 } as const;
export const DOT_RED_TARGET = { x: 90.15, y: 266.77 } as const;
export const DOT_WHITE_TARGET = { x: 181.85, y: 116.4 } as const;

/**
 * Approximate stroke lengths for dash-based draw-on animation (canvas Path2D
 * has no getTotalLength; the original measured at runtime). Slightly generous
 * values just mean the reveal completes marginally early — visually identical.
 */
export const MONO_WHITE_LEN = 700;
export const MONO_RED_LEN = 650;
