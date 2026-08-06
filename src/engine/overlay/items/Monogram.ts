import type { AudioFrame } from '../../audio/AudioFrame';
import { approach } from '../../smoothing';
import { fadeWindow, type OverlayItem, type OverlayView, smoothstep } from '../OverlayItem';
import {
  BAR_CENTER_Y,
  BAR_W,
  BAR_XS,
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
 * Footer monogram — a deterministic port of the original LogoAnimation
 * choreography, phase for phase:
 *
 *   BARS    audio-reactive bars (rise fast, fall slow, per-band mapping)
 *   CALM    bars ease back to rest
 *   WAVE    staggered jump with a bounce landing
 *   SPLIT   inner bars collapse; outer bars morph into dots
 *   TRAVEL  the dots fly to the path endpoints (left one turns red)
 *   DRAW    the two strokes draw on between the dots
 *   BEAT    hold: bass pulses scale, low-mids sway rotation, glows react
 *   UNDRAW/RETURN reverse back to bars, and the cycle repeats
 *
 * Choreography is a pure function of track time; the smoothing runs on
 * frame-time deltas (not per-frame factors), so it looks identical on 120Hz
 * displays and in the fixed-step offline export.
 */

// Phase boundaries within one cycle (seconds).
const CALM_AT = 30.0;
const WAVE_AT = 30.3;
const SPLIT_AT = 31.15;
const TRAVEL_AT = 31.25;
const TRAVEL_DUR = 0.9;
const DRAW_AT = 31.95;
const DRAW_DUR = 1.4;
const BEAT_AT = DRAW_AT + DRAW_DUR; // 33.35
const UNDRAW_AT = 48.35;
const UNDRAW_DUR = 0.6;
const RETURN_AT = 48.85;
const RETURN_DUR = 0.7;
const CYCLE = 50.0;

const DOT_R = 11;
const BASE_ALPHA = 0.5; // the original footer logo sat at ~40% opacity

// Per-second smoothing rates: dt-based equivalents of the original per-frame
// factors at 60fps (rate = -60·ln(1-f)).
const BAR_RISE_RATE = -60 * Math.log(0.4); // f = 0.6
const BAR_FALL_RATE = -60 * Math.log(0.92); // f = 0.08
const CALM_RATE = -60 * Math.log(0.7); // f = 0.3
const SCALE_RATE = -60 * Math.log(0.9); // f = 0.1
const ROT_RATE = -60 * Math.log(0.95); // f = 0.05

// Rest-position dot centres (bars at rest, centre of each 16×16 capsule).
const REST_RED = { x: (BAR_XS[0] ?? 83) + BAR_W / 2, y: BAR_CENTER_Y };
const REST_WHITE = { x: (BAR_XS[3] ?? 173) + BAR_W / 2, y: BAR_CENTER_Y };

export class Monogram implements OverlayItem {
  enabled = false;

  /** Footer envelope: in with the footer, no scheduled out. */
  timing = { start: 3.0, inDur: 1.5, outAt: Number.MAX_SAFE_INTEGER, outDur: 1 };

  private readonly white = new Path2D(MONO_WHITE);
  private readonly red = new Path2D(MONO_RED);
  private readonly heights = [BAR_W, BAR_W, BAR_W, BAR_W];
  private smoothScale = 1;
  private smoothRot = 0;
  private lastTime: number | null = null;

  get active(): boolean {
    return this.enabled;
  }

  draw(ctx: CanvasRenderingContext2D, view: OverlayView, frame: AudioFrame): void {
    const t = frame.time;
    // Frame-time delta for the smoothing below; the first frame assumes 60fps.
    const dt = this.lastTime === null ? 1 / 60 : Math.min(0.1, Math.max(0, t - this.lastTime));
    this.lastTime = t;

    const { start, inDur, outAt, outDur } = this.timing;
    const envelope = fadeWindow(t, start, inDur, outAt, outDur);
    if (envelope <= 0.001) return;

    const tau = Math.max(0, t - start) % CYCLE;
    const margin = Math.max(24, view.w * 0.03);
    const height = 46;
    const scale = height / MONO_BOX.h;

    ctx.globalAlpha = envelope * BASE_ALPHA;
    ctx.save();
    ctx.translate(margin, view.h - margin - height);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tau < CALM_AT) {
      this.drawReactiveBars(ctx, frame, dt);
    } else if (tau < WAVE_AT) {
      this.drawCalmingBars(ctx, dt);
    } else if (tau < SPLIT_AT) {
      this.drawWaveBars(ctx, tau - WAVE_AT);
    } else if (tau < BEAT_AT) {
      this.drawMorph(ctx, tau);
    } else if (tau < UNDRAW_AT) {
      this.drawBeat(ctx, frame, dt);
    } else {
      this.drawReturn(ctx, tau);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ---- BARS: the original band mapping with rise-fast/fall-slow easing ----

  private barTargets(frame: AudioFrame): number[] {
    const { bass, lowMid, highMid, treble } = frame.bands;
    return [
      BAR_W + bass ** 1.8 * 140,
      BAR_W + lowMid ** 1.8 * 160,
      BAR_W + highMid ** 1.8 * 180,
      BAR_W + treble ** 1.8 * 260,
    ];
  }

  private drawReactiveBars(ctx: CanvasRenderingContext2D, frame: AudioFrame, dt: number): void {
    const targets = this.barTargets(frame);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const target = Math.min(180, targets[i] ?? BAR_W);
      const current = this.heights[i] ?? BAR_W;
      const rate = target > current ? BAR_RISE_RATE : BAR_FALL_RATE;
      this.heights[i] = Math.max(BAR_W, approach(current, target, rate, dt));
      this.bar(ctx, i, this.heights[i] ?? BAR_W, 0, 1);
    }
  }

  private drawCalmingBars(ctx: CanvasRenderingContext2D, dt: number): void {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const current = this.heights[i] ?? BAR_W;
      this.heights[i] = approach(current, BAR_W, CALM_RATE, dt);
      this.bar(ctx, i, this.heights[i] ?? BAR_W, 0, 1);
    }
  }

  // ---- WAVE: staggered jump with a bounced landing ----

  private drawWaveBars(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const local = w - i * 0.05; // stagger
      let yOff = 0;
      if (local > 0 && local < 0.2) {
        yOff = -20 * sineOut(local / 0.2);
      } else if (local >= 0.2) {
        yOff = -20 * (1 - bounceOut(Math.min(1, (local - 0.2) / 0.4)));
      }
      this.heights[i] = BAR_W;
      this.bar(ctx, i, BAR_W, yOff, 1);
    }
  }

  // ---- SPLIT + TRAVEL + DRAW: bars become dots, the logo draws on ----

  private drawMorph(ctx: CanvasRenderingContext2D, tau: number): void {
    // Inner bars collapse.
    const splitP = smoothstep((tau - SPLIT_AT) / 0.2);
    if (splitP < 1) {
      ctx.fillStyle = `rgba(255,255,255,${1 - splitP})`;
      const h = BAR_W * (1 - splitP);
      this.bar(ctx, 1, h, 0, 1 - splitP);
      this.bar(ctx, 2, h, 0, 1 - splitP);
    }

    // Outer dots grow and travel to the path endpoints.
    const travelP = pow3InOut(clamp01((tau - TRAVEL_AT) / TRAVEL_DUR));
    const drawn = expoInOut(clamp01((tau - DRAW_AT) / DRAW_DUR));

    if (drawn > 0) this.strokePaths(ctx, drawn, 0, 0);
    this.drawDots(ctx, travelP, travelP); // colour morph follows the travel
  }

  // ---- BEAT: the hold, reacting to the music like the original ----

  private drawBeat(ctx: CanvasRenderingContext2D, frame: AudioFrame, dt: number): void {
    const bassImpact = frame.bands.bass ** 3;
    const highImpact = frame.bands.treble ** 2;
    this.smoothScale = approach(this.smoothScale, 1 + bassImpact * 0.03, SCALE_RATE, dt);
    this.smoothRot = approach(
      this.smoothRot,
      (frame.bands.lowMid * 1.5 - 0.75) * (Math.PI / 180),
      ROT_RATE,
      dt,
    );

    ctx.save();
    ctx.translate(MONO_BOX.w / 2, MONO_BOX.h / 2);
    ctx.scale(this.smoothScale, this.smoothScale);
    ctx.rotate(this.smoothRot);
    ctx.translate(-MONO_BOX.w / 2, -MONO_BOX.h / 2);
    this.strokePaths(ctx, 1, 5 + bassImpact * 45, 2 + highImpact * 25);
    this.drawDots(ctx, 1, 1);
    ctx.restore();
  }

  // ---- UNDRAW + RETURN: reverse back to the bars ----

  private drawReturn(ctx: CanvasRenderingContext2D, tau: number): void {
    const undrawn = 1 - pow4In(clamp01((tau - UNDRAW_AT) / UNDRAW_DUR));
    const returnP = backOut(clamp01((tau - RETURN_AT) / RETURN_DUR));

    if (undrawn > 0) this.strokePaths(ctx, undrawn, 0, 0);
    this.drawDots(ctx, 1 - returnP, 1 - returnP);

    // Inner bars fade back in near the end.
    const innerP = smoothstep((tau - (RETURN_AT + 0.4)) / 0.3);
    if (innerP > 0) {
      ctx.fillStyle = `rgba(255,255,255,${innerP})`;
      this.bar(ctx, 1, BAR_W, 0, innerP);
      this.bar(ctx, 2, BAR_W, 0, innerP);
      this.heights.fill(BAR_W);
    }
  }

  // ---- shared drawing helpers (all in source 272×346 coordinates) ----

  private bar(
    ctx: CanvasRenderingContext2D,
    index: number,
    h: number,
    yOff: number,
    alpha: number,
  ): void {
    if (alpha <= 0 || h <= 0) return;
    const x = BAR_XS[index] ?? 83;
    ctx.beginPath();
    ctx.roundRect(x, BAR_CENTER_Y - h / 2 + yOff, BAR_W, h, BAR_W / 2);
    ctx.fill();
  }

  /** The two travelling dots; travelP 0=at bars, 1=at path endpoints. */
  private drawDots(ctx: CanvasRenderingContext2D, travelP: number, redP: number): void {
    const r = BAR_W / 2 + (DOT_R - BAR_W / 2) * travelP;

    const rx = REST_RED.x + (DOT_RED_TARGET.x - REST_RED.x) * travelP;
    const ry = REST_RED.y + (DOT_RED_TARGET.y - REST_RED.y) * travelP;
    const wx = REST_WHITE.x + (DOT_WHITE_TARGET.x - REST_WHITE.x) * travelP;
    const wy = REST_WHITE.y + (DOT_WHITE_TARGET.y - REST_WHITE.y) * travelP;

    // White dot.
    ctx.fillStyle = '#ffffff';
    circle(ctx, wx, wy, r);
    // Left dot cross-fades white → red as it travels (like the original).
    if (redP < 1) {
      ctx.fillStyle = '#ffffff';
      circle(ctx, rx, ry, r);
    }
    if (redP > 0) {
      ctx.save();
      ctx.globalAlpha *= redP;
      ctx.fillStyle = MONO_RED_COLOR;
      circle(ctx, rx, ry, r);
      ctx.restore();
    }
  }

  private strokePaths(
    ctx: CanvasRenderingContext2D,
    drawn: number,
    redGlow: number,
    whiteGlow: number,
  ): void {
    ctx.lineWidth = MONO_STROKE;

    ctx.setLineDash([MONO_WHITE_LEN]);
    ctx.lineDashOffset = (1 - drawn) * MONO_WHITE_LEN;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur = whiteGlow;
    ctx.stroke(this.white);

    ctx.setLineDash([MONO_RED_LEN]);
    ctx.lineDashOffset = (1 - drawn) * MONO_RED_LEN;
    ctx.strokeStyle = MONO_RED_COLOR;
    ctx.shadowColor = 'rgba(226,29,41,0.7)';
    ctx.shadowBlur = redGlow;
    ctx.stroke(this.red);

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
}

// ---- easings (matching the original's GSAP curves closely) ----

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function sineOut(x: number): number {
  return Math.sin((clamp01(x) * Math.PI) / 2);
}

function bounceOut(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  const v = clamp01(x);
  if (v < 1 / d1) return n1 * v * v;
  if (v < 2 / d1) {
    const w = v - 1.5 / d1;
    return n1 * w * w + 0.75;
  }
  if (v < 2.5 / d1) {
    const w = v - 2.25 / d1;
    return n1 * w * w + 0.9375;
  }
  const w = v - 2.625 / d1;
  return n1 * w * w + 0.984375;
}

function pow3InOut(x: number): number {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2;
}

function pow4In(x: number): number {
  return clamp01(x) ** 4;
}

function expoInOut(x: number): number {
  const v = clamp01(x);
  if (v === 0 || v === 1) return v;
  return v < 0.5 ? 2 ** (20 * v - 10) / 2 : (2 - 2 ** (-20 * v + 10)) / 2;
}

function backOut(x: number): number {
  const c1 = 1.70158;
  const v = clamp01(x) - 1;
  return 1 + (c1 + 1) * v ** 3 + c1 * v * v;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
