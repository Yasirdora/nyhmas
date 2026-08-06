import { OVERLAY_FONT } from './OverlayItem';

export interface TextStyle {
  size: number;
  weight?: number;
  color?: string;
  letterSpacing?: number; // px
  glow?: { color: string; blur: number };
  align?: CanvasTextAlign;
}

export function setFont(ctx: CanvasRenderingContext2D, style: TextStyle): void {
  ctx.font = `${style.weight ?? 400} ${style.size}px ${OVERLAY_FONT}`;
  ctx.textAlign = style.align ?? 'center';
  ctx.textBaseline = 'middle';
  // Chromium supports canvas letterSpacing; elsewhere text just tracks tighter.
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${style.letterSpacing ?? 0}px`;
  }
}

/** Draw one line with optional soft glow (drawn as shadow). */
export function drawLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  setFont(ctx, style);
  if (style.glow) {
    ctx.shadowColor = style.glow.color;
    ctx.shadowBlur = style.glow.blur;
  } else {
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = style.color ?? '#f5f5f7';
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

/** Word-wrap `text` to maxWidth using the current style; \n forces breaks. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  style: TextStyle,
): string[] {
  setFont(ctx, style);
  const out: string[] = [];
  for (const hard of text.split('\n')) {
    let line = '';
    for (const word of hard.split(/\s+/).filter(Boolean)) {
      const probe = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(probe).width > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
