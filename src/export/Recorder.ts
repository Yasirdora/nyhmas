/**
 * Tier-1 video export: real-time capture.
 *
 * Grabs the live canvas via `captureStream`, muxes in the WebAudio stream, and
 * feeds both to a MediaRecorder. Simple and universal — quality tracks
 * real-time performance. The deterministic, frame-perfect Tier-2 exporter
 * (WebCodecs, see OfflineRenderer) is preferred where supported; this is the
 * always-available option.
 *
 * Caveat: the captured canvas is driven by requestAnimationFrame, which is
 * suspended in hidden tabs — recording in the background freezes the video
 * while audio continues. The UI warns the user to keep the tab visible.
 */

import { applySrgbColorTag } from './mp4ColorTag';

interface MimeChoice {
  mimeType: string;
  ext: 'mp4' | 'webm';
}

const MIME_CANDIDATES: MimeChoice[] = [
  // High profile first: CABAC + B-frames buy ~30% quality per bit over the
  // Baseline profile — significant for high-entropy particle content.
  { mimeType: 'video/mp4;codecs=avc1.640034,mp4a.40.2', ext: 'mp4' }, // High @ L5.2
  { mimeType: 'video/mp4;codecs=avc1.640033,mp4a.40.2', ext: 'mp4' }, // High @ L5.1
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' }, // Baseline fallback
  { mimeType: 'video/mp4', ext: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mimeType: 'video/webm', ext: 'webm' },
];

/**
 * Bitrate guidance for particle-visual content. Thousands of tiny bright dots
 * on black are the highest-entropy input a video codec meets — far above
 * broadcast norms — so bits-per-pixel-per-frame must run high (0.15 bpp) to
 * keep the sparkle from smearing into mush. Floored for small canvases,
 * capped so file sizes stay sane.
 */
export function recommendedVideoBitrate(width: number, height: number, fps: number): number {
  return Math.min(Math.max(width * height * fps * 0.15, 12_000_000), 50_000_000);
}

function pickMime(): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

export interface RecorderOptions {
  fps?: number;
  videoBitsPerSecond?: number;
}

export class Recorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private readonly choice: MimeChoice | null;
  private baseName = 'nyhmas';

  /** Called with the finished file once recording stops. */
  onComplete?: (blob: Blob, filename: string) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly audioStream: MediaStream,
    private readonly options: RecorderOptions = {},
  ) {
    this.choice = pickMime();
  }

  get supported(): boolean {
    return this.choice !== null;
  }

  get container(): string {
    return this.choice?.ext ?? 'webm';
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  start(baseName: string): void {
    if (!this.choice) throw new Error('MediaRecorder is not supported in this browser.');
    this.baseName = baseName || 'nyhmas';
    this.chunks = [];

    const fps = this.options.fps ?? 60;
    const videoStream = this.canvas.captureStream(fps);
    // Hint the encoder that this is continuous motion (a visualizer), so it
    // optimizes for smooth frame delivery over static-detail preservation.
    for (const track of videoStream.getVideoTracks()) track.contentHint = 'motion';
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...this.audioStream.getAudioTracks(),
    ]);

    this.recorder = new MediaRecorder(combined, {
      mimeType: this.choice.mimeType,
      videoBitsPerSecond:
        this.options.videoBitsPerSecond ??
        recommendedVideoBitrate(this.canvas.width, this.canvas.height, fps),
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      void this.finish();
    };
    this.recorder.start(100);
  }

  private async finish(): Promise<void> {
    const choice = this.choice!;
    let blob = new Blob(this.chunks, { type: choice.mimeType });
    if (choice.ext === 'mp4') {
      // Chrome tags canvas captures as BT.601/BT.709, which QuickTime renders
      // with a broadcast EOTF — dull next to the live page. Retag as sRGB.
      // Chrome's MediaRecorder converts canvas RGB with the BT.601 matrix.
      const tagged = applySrgbColorTag(await blob.arrayBuffer());
      blob = new Blob([tagged], { type: choice.mimeType });
    }
    this.onComplete?.(blob, `${this.baseName}.${choice.ext}`);
  }

  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
