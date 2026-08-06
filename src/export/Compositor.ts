/**
 * Composites the WebGL frame and the overlay canvas into one canvas for video
 * capture. Needed because captureStream/VideoFrame only see a single canvas's
 * pixels — this is what burns titles/lyrics into the exported video.
 *
 * Sized to the WebGL drawing buffer (even dimensions for the H.264 encoder);
 * layers are drawn scaled to fill, so differing buffer resolutions are fine.
 */
export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('[compositor] 2D context unavailable');
    this.ctx = ctx;
  }

  /** Match the source buffer, clamped to even dimensions for the encoder. */
  setSizeFrom(source: HTMLCanvasElement): void {
    const w = Math.max(2, source.width - (source.width % 2));
    const h = Math.max(2, source.height - (source.height % 2));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Draw the layers bottom-up, scaled to fill the composite frame. */
  blit(...layers: HTMLCanvasElement[]): void {
    const { width, height } = this.canvas;
    for (const layer of layers) {
      if (layer.width === 0 || layer.height === 0) continue;
      this.ctx.drawImage(layer, 0, 0, width, height);
    }
  }
}
