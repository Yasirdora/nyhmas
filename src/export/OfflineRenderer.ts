import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny';
import { OfflineAudioSource } from '../engine/audio/OfflineAudioSource';
import { FrameClock } from '../engine/Clock';
import type { Engine } from '../engine/Engine';
import { Compositor } from './Compositor';
import { recommendedVideoBitrate } from './Recorder';

/**
 * Tier-2 export: deterministic, frame-perfect render.
 *
 * Drives the engine off a FrameClock and an OfflineAudioSource, renders every
 * frame regardless of wall-clock, and encodes H.264 video + AAC audio into an
 * MP4 via mediabunny (which owns the WebCodecs encoders, backpressure, and
 * resource cleanup) — all client-side. No dropped frames, any resolution,
 * exact A/V sync. Falls back to Tier-1 where WebCodecs is unavailable (see
 * offlineExportSupported).
 *
 * Pass an AbortSignal to make the render cancellable; aborting throws an
 * `AbortError` DOMException and the output (encoders included) is canceled.
 */
export function offlineExportSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined'
  );
}

export interface OfflineRenderOptions {
  fps?: number;
  videoBitrate?: number;
  onProgress?: (fraction: number) => void;
  /** When set, overlay pixels are composited over each frame (burn-in). */
  overlayCanvas?: HTMLCanvasElement;
  /** Abort the render (throws AbortError, the output is canceled). */
  signal?: AbortSignal;
}

export class OfflineRenderer {
  constructor(
    private readonly engine: Engine,
    private readonly buffer: AudioBuffer,
    private readonly options: OfflineRenderOptions = {},
  ) {}

  async render(baseName: string): Promise<{ blob: Blob; filename: string }> {
    if (!offlineExportSupported()) {
      throw new Error('WebCodecs export is not supported in this browser.');
    }
    const { signal } = this.options;
    signal?.throwIfAborted();

    // 60fps to match the live look — all reaction smoothing is tuned per-frame
    // at 60, so rendering at 30 made motion choppy AND reactions sluggish.
    const fps = this.options.fps ?? 60;
    const onProgress = this.options.onProgress ?? (() => {});

    const source = new OfflineAudioSource(this.buffer);
    this.engine.enterOfflineMode(new FrameClock(fps), source);
    // Apply the forced full-resolution scale BEFORE measuring the canvas — the
    // resize is otherwise deferred to the first rendered frame, and the encoder
    // would be configured for the previously degraded live size.
    this.engine.flushPendingScale();

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    try {
      const canvas = this.engine.canvas;
      // Bitrate scales with resolution + fps: particle fields are
      // high-entropy content, a fixed default starves the encoder at 4K.
      const bitrate =
        this.options.videoBitrate ?? recommendedVideoBitrate(canvas.width, canvas.height, fps);

      // With overlays active, frames are composited (WebGL + overlay) before
      // encoding so titles/lyrics burn into the video.
      let compositor: Compositor | null = null;
      let captureSource: HTMLCanvasElement = canvas;
      if (this.options.overlayCanvas) {
        compositor = new Compositor();
        compositor.setSizeFrom(canvas);
        captureSource = compositor.canvas;
      }

      // CanvasSource captures the canvas at each add() call; awaiting add()
      // propagates encoder backpressure straight into the render loop.
      const videoSource = new CanvasSource(captureSource, {
        codec: 'avc',
        quality: new Quality({ bitrate }),
        keyFrameInterval: 2, // seconds between key frames
      });
      // frameRate snaps frame timestamps to the exact export cadence.
      output.addVideoTrack(videoSource, { frameRate: fps });

      const audioSource = new AudioBufferSource({
        codec: 'aac',
        quality: new Quality({ bitrate: 192_000 }),
      });
      output.addAudioTrack(audioSource);

      await output.start();

      // Audio first: MP4 muxing buffers packets until all tracks deliver, so
      // feeding the small track first keeps peak memory low (the recommended
      // pattern); the huge video stream then flows straight through.
      await audioSource.add(this.buffer);
      audioSource.close();
      onProgress(0.05);

      // --- Video: deterministic frame-by-frame ---
      const totalFrames = Math.max(1, Math.ceil(this.buffer.duration * fps));
      const frameDur = 1 / fps;

      for (let n = 0; n < totalFrames; n++) {
        signal?.throwIfAborted();

        this.engine.renderFrame(); // advances FrameClock + offline audio, renders
        if (compositor && this.options.overlayCanvas) {
          compositor.blit(canvas, this.options.overlayCanvas);
        }
        // Captures + queues the frame; the await applies encoder backpressure.
        await videoSource.add(n * frameDur, frameDur);

        if (n % 4 === 0) {
          onProgress(0.05 + (n / totalFrames) * 0.95);
          await yieldToUi();
        }
      }
      videoSource.close();

      await output.finalize();
      onProgress(1);

      const buffer = output.target.buffer;
      if (!buffer) throw new Error('Export finalized without producing a file.');
      return {
        blob: new Blob([buffer], { type: 'video/mp4' }),
        filename: `${baseName}.mp4`,
      };
    } catch (err) {
      // Releases everything the output holds (encoders, writer) — safe to call
      // on a failed or aborted render, a no-op once finalized.
      if (output.state === 'started') await output.cancel().catch(() => {});
      throw err;
    } finally {
      this.engine.exitOfflineMode();
    }
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
