import * as THREE from 'three';

/**
 * Thin wrapper over THREE.WebGLRenderer.
 *
 * Isolated behind this module so a WebGPU backend can be swapped in later
 * without touching the Engine, hosts, or effects. `antialias` is intentionally
 * off: the post-processing composer owns AA/tonemap, so canvas MSAA would be
 * wasted memory here. Adaptive resolution is expressed as a pixel-ratio scale
 * driven by the QualityManager.
 */
export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  maxPixelRatio?: number;
}

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;

  private readonly maxPixelRatio: number;
  private basePixelRatio: number;
  private scale = 1;

  constructor(options: RendererOptions = {}) {
    this.three = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.domElement = this.three.domElement;
    this.three.setClearColor(0x000000, 1);
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.toneMapping = THREE.NoToneMapping; // OutputPass handles tonemap

    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.three.setPixelRatio(this.basePixelRatio);
  }

  setSize(w: number, h: number): void {
    // false: we size the canvas via CSS, three only sizes the drawing buffer.
    this.three.setSize(w, h, false);
  }

  /** Adaptive resolution: 0..1 multiplier on the base pixel ratio. */
  setScale(scale: number): void {
    this.scale = scale;
    this.three.setPixelRatio(this.basePixelRatio * scale);
  }

  get pixelRatio(): number {
    return this.basePixelRatio * this.scale;
  }

  get currentScale(): number {
    return this.scale;
  }

  dispose(): void {
    this.three.dispose();
  }
}
