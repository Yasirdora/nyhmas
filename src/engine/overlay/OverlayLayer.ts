import type { AudioFrame } from '../audio/AudioFrame';
import type { OverlayItem } from './OverlayItem';

/**
 * A transparent 2D canvas stacked above the WebGL canvas — the single source
 * of truth for overlay rendering (titles, lyrics, branding). The live view
 * shows this canvas directly; exports composite it over the WebGL frame, so
 * what you see is exactly what burns into the video.
 *
 * Costs nothing when empty: with no active items the canvas is cleared once
 * and then skipped entirely.
 */
export class OverlayLayer {
  readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;
  private items: OverlayItem[] = [];
  private width = 1;
  private height = 1;
  private dpr = 1;
  private dirty = false; // canvas currently has pixels that may need clearing

  constructor(container: HTMLElement, maxPixelRatio = 2) {
    this.canvas = document.createElement('canvas');
    const style = this.canvas.style;
    style.position = 'absolute';
    style.inset = '0';
    style.width = '100%';
    style.height = '100%';
    style.display = 'block';
    style.pointerEvents = 'none';
    style.zIndex = '1'; // above the WebGL canvas, below the DOM UI
    container.appendChild(this.canvas);

    this.dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('[overlay] 2D context unavailable');
    this.ctx = ctx;
  }

  setItems(items: OverlayItem[]): void {
    this.items = items;
  }

  get hasActiveItems(): boolean {
    return this.items.some((i) => i.active);
  }

  resize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.dirty = true; // buffer was reset; force a redraw/clear
  }

  /** Draw all active items for the frame's audio time. */
  update(_dt: number, frame: AudioFrame): void {
    const active = this.items.filter((i) => i.active);
    if (active.length === 0) {
      if (this.dirty) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.dirty = false;
      }
      return;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); // draw in CSS pixels
    const view = { w: this.width, h: this.height, dpr: this.dpr };
    for (const item of active) {
      ctx.save();
      item.draw(ctx, view, frame);
      ctx.restore();
    }
    this.dirty = true;
  }

  dispose(): void {
    this.canvas.remove();
  }
}
