import * as THREE from 'three';
import type { Compositor } from '../export/Compositor';
import { AudioFrame } from './audio/AudioFrame';
import type { AudioSource } from './audio/AudioSource';
import { type Clock, LiveClock } from './Clock';
import type { Effect, EngineContext } from './effects/Effect';
import type { OverlayLayer } from './overlay/OverlayLayer';
import { type BloomConfig, DEFAULT_BLOOM, PostFX } from './postfx/PostFX';
import { type Capabilities, detectCapabilities } from './quality/Capabilities';
import { QualityManager } from './quality/QualityManager';
import type { Renderable } from './Renderable';
import { Renderer } from './Renderer';
import type { EngineStats } from './types';

export type { Renderable };

export interface EngineOptions {
  bloom?: BloomConfig;
  /** Called ~4x/sec with smoothed stats (for a dev FPS overlay). */
  onStats?: (stats: EngineStats) => void;
}

/**
 * The engine: owns the renderer, a single rAF loop, adaptive quality, and the
 * shared post-processing chain. It is deliberately effect-agnostic — you hand
 * it a Renderable and it drives it. Time comes from a swappable Clock so that
 * offline export can render deterministically.
 */
export class Engine {
  readonly renderer: Renderer;
  readonly capabilities: Capabilities;
  readonly postfx: PostFX;

  private readonly container: HTMLElement;
  private readonly quality: QualityManager;
  private readonly onStats?: (stats: EngineStats) => void;

  private clock: Clock = new LiveClock();
  private renderable: Renderable | null = null;
  private audioSource: AudioSource | null = null;
  private overlay: OverlayLayer | null = null;
  /** While set, each rendered frame is composited (WebGL + overlay) into it. */
  private compositor: Compositor | null = null;
  /** Silent fallback so effects always receive a valid AudioFrame. */
  private readonly silentFrame = new AudioFrame(256, 512);

  private raf = 0;
  private running = false;
  private startedOnce = false;
  private lastTimestamp = -1;
  private width = 1;
  private height = 1;

  private statsAccum = 0;
  private adaptiveQuality = true;
  private pendingScale: number | null = null;
  private saved: { clock: Clock; source: AudioSource | null; running: boolean } | null = null;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, options: EngineOptions = {}) {
    this.container = container;
    this.onStats = options.onStats;
    this.capabilities = detectCapabilities();

    this.renderer = new Renderer({ maxPixelRatio: this.capabilities.maxPixelRatio });
    this.styleAndMount(this.renderer.domElement);

    const rect = container.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(this.width, this.height);

    // Placeholder scene/camera until a Renderable is attached.
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 100);
    this.postfx = new PostFX(
      this.renderer.three,
      scene,
      camera,
      this.width,
      this.height,
      options.bloom,
    );
    this.postfx.setPixelRatio(this.renderer.pixelRatio);

    this.quality = new QualityManager({
      // Don't resize immediately: a buffer resize clears the canvas to black,
      // and anything the browser presents before the next render is a dead
      // frame. Defer to the start of the next frame instead, where resize and
      // repaint happen inside the same rAF callback.
      onScaleChange: (scale) => {
        this.pendingScale = scale;
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  private styleAndMount(canvas: HTMLCanvasElement): void {
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.transition = 'opacity 400ms ease';
    this.container.appendChild(canvas);
  }

  /**
   * Dim the on-screen canvas (e.g. while Fast render draws export frames into
   * it — the fast-forward isn't playback and shouldn't read as such). CSS
   * opacity only affects presentation; captured/encoded pixels are untouched.
   */
  setStageDimmed(dimmed: boolean): void {
    this.renderer.domElement.style.opacity = dimmed ? '0.08' : '1';
  }

  setRenderable(renderable: Renderable | null): void {
    this.renderable?.dispose?.();
    this.renderable = renderable;
    if (renderable) {
      this.postfx.setScene(renderable.scene, renderable.camera);
      renderable.resize?.(this.width, this.height);
    }
  }

  setAudioSource(source: AudioSource | null): void {
    this.audioSource = source;
  }

  /** Attach the overlay layer; the engine drives its updates and resizing. */
  setOverlay(layer: OverlayLayer | null): void {
    this.overlay = layer;
    layer?.resize(this.width, this.height);
  }

  /**
   * While recording with overlays, frames must be composited (WebGL + overlay)
   * into one canvas for capture. Set to null when not recording.
   */
  setCompositeTarget(compositor: Compositor | null): void {
    this.compositor = compositor;
  }

  /** Draw overlay for this frame, then composite if a recording needs it. */
  private finishFrame(dt: number, frame: AudioFrame): void {
    this.overlay?.update(dt, frame);
    if (this.compositor && this.overlay) {
      this.compositor.blit(this.renderer.domElement, this.overlay.canvas);
    }
  }

  getSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Pause/resume adaptive resolution (pinned during export to fix dimensions). */
  setAdaptiveQuality(enabled: boolean): void {
    this.adaptiveQuality = enabled;
  }

  /**
   * Switch into deterministic offline rendering: stop the live loop, pin full
   * resolution, and install the given clock + audio source. Call renderFrame()
   * per frame, then exitOfflineMode() to restore live playback.
   */
  enterOfflineMode(clock: Clock, source: AudioSource): void {
    this.saved = { clock: this.clock, source: this.audioSource, running: this.running };
    this.stop();
    this.setAdaptiveQuality(false);
    this.quality.forceScale(1);
    this.setClock(clock);
    this.setAudioSource(source);
  }

  exitOfflineMode(): void {
    if (!this.saved) return;
    const { clock, source, running } = this.saved;
    this.saved = null;
    this.setClock(clock);
    this.setAudioSource(source);
    this.setAdaptiveQuality(true);
    if (running) this.start();
  }

  /** Build the effect's context, initialize it, and make it the active scene. */
  async mountEffect(effect: Effect): Promise<void> {
    // Isolation: shared post-FX state resets to defaults on every mount, so an
    // effect only ever sees a clean slate — no bloom settings leaking from the
    // previously active effect.
    this.postfx.setBloom(DEFAULT_BLOOM);
    this.postfx.setBloomEnabled(true);

    const ctx: EngineContext = {
      renderer: this.renderer.three,
      postfx: this.postfx,
      tier: this.capabilities.initialTier,
      width: this.width,
      height: this.height,
    };
    await effect.init(ctx);
    this.setRenderable(effect);
  }

  /** Swap the time source (LiveClock for playback, FrameClock for export). */
  setClock(clock: Clock): void {
    this.clock = clock;
    this.lastTimestamp = -1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = -1;
    // Reset the clock only on the very first start; on resume, time continues
    // (LiveClock clamps the gap so there's no visual jump).
    if (!this.startedOnce) {
      this.startedOnce = true;
      this.clock.reset();
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Render a single frame without advancing time — used to show a frozen frame
   * while the loop is stopped (pause, seek-while-paused, effect switch).
   */
  renderStill(): void {
    this.applyPendingScale();
    const t = this.clock.time;
    this.audioSource?.update(t);
    const frame = this.audioSource?.frame ?? this.silentFrame;
    this.renderable?.update(0, t, frame);
    this.postfx.render(0);
    this.overlay?.update(0, frame);
  }

  /**
   * Apply any queued adaptive-resolution resize immediately, outside a frame.
   * Exporters must call this before measuring the canvas — otherwise the
   * encoder is configured for the previously degraded live size while frames
   * are rendered at full resolution.
   */
  flushPendingScale(): void {
    this.applyPendingScale();
  }

  /** Apply a deferred resolution change right before rendering a frame. */
  private applyPendingScale(): void {
    if (this.pendingScale === null) return;
    const scale = this.pendingScale;
    this.pendingScale = null;
    this.renderer.setScale(scale);
    this.postfx.setPixelRatio(this.renderer.pixelRatio);
  }

  private loop = (timestamp: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    this.applyPendingScale();

    // Frame interval is the smoothness signal fed to adaptive resolution.
    const intervalMs = this.lastTimestamp < 0 ? 1000 / 60 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const { dt, t } = this.clock.tick(timestamp);
    this.audioSource?.update(t);
    const frame = this.audioSource?.frame ?? this.silentFrame;
    this.renderable?.update(dt, t, frame);
    this.postfx.render(dt);
    this.finishFrame(dt, frame);

    if (this.adaptiveQuality) this.quality.sample(intervalMs);
    this.emitStats(intervalMs);
  };

  /** Render exactly one frame off a deterministic clock (offline export). */
  renderFrame(): void {
    this.applyPendingScale();
    const { dt, t } = this.clock.tick(0);
    this.audioSource?.update(t);
    const frame = this.audioSource?.frame ?? this.silentFrame;
    this.renderable?.update(dt, t, frame);
    this.postfx.render(dt);
    this.overlay?.update(dt, frame); // offline compositing is the exporter's job
  }

  private emitStats(intervalMs: number): void {
    if (!this.onStats) return;
    this.statsAccum += intervalMs;
    if (this.statsAccum >= 250) {
      this.statsAccum = 0;
      this.onStats({
        fps: this.quality.fps,
        scale: this.quality.currentScale,
        pixelRatio: this.renderer.pixelRatio,
      });
    }
  }

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    this.renderer.setSize(w, h);
    this.postfx.setSize(w, h);
    this.postfx.setPixelRatio(this.renderer.pixelRatio);

    const cam = this.renderable?.camera;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.renderable?.resize?.(w, h);
    this.overlay?.resize(w, h);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.setRenderable(null);
    this.audioSource?.dispose();
    this.silentFrame.dispose();
    this.postfx.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
