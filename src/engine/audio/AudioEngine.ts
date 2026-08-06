/**
 * Owns the WebAudio graph and playback transport.
 *
 * Graph: BufferSource → gain → analyser → destination. Because
 * AudioBufferSourceNodes are one-shot, the transport manages them explicitly:
 * play creates a fresh node from the current offset, pause records elapsed time
 * and stops it, seek restarts at a new offset. `currentTime` is derived from
 * the audio clock so it stays sample-accurate.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;

  private readonly gain: GainNode;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private playing = false;

  /** Fires when the track reaches its natural end. */
  onEnded?: () => void;

  constructor(fftSize = 2048) {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0.7;

    this.gain = this.ctx.createGain();
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /** Decode compressed audio bytes into an AudioBuffer. */
  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(data);
  }

  setBuffer(buffer: AudioBuffer): void {
    this.stopSource();
    this.buffer = buffer;
    this.offset = 0;
    this.playing = false;
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.onended = () => {
      // Only natural end reaches here — manual stops null this handler first.
      if (this.playing) {
        this.playing = false;
        this.offset = this.duration;
        this.onEnded?.();
      }
    };
    src.start(0, this.offset);

    this.source = src;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.playing = false;
    this.stopSource();
  }

  async toggle(): Promise<void> {
    if (this.playing) this.pause();
    else await this.play();
  }

  seek(t: number): void {
    const target = Math.max(0, Math.min(t, this.duration));
    const wasPlaying = this.playing;
    this.stopSource();
    this.playing = false;
    this.offset = target;
    if (wasPlaying) void this.play();
  }

  private stopSource(): void {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // already stopped
    }
    this.source.disconnect();
    this.source = null;
  }

  setVolume(value: number): void {
    this.gain.gain.value = value;
  }

  /**
   * A MediaStream carrying the playing audio, for muxing into a recording.
   * Created lazily and tapped off the gain node so it mirrors what's heard.
   */
  getRecordingStream(): MediaStream {
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.gain.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  get currentTime(): number {
    if (!this.buffer) return 0;
    const base = this.playing ? this.offset + (this.ctx.currentTime - this.startedAt) : this.offset;
    return Math.min(base, this.duration);
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isLoaded(): boolean {
    return this.buffer !== null;
  }

  dispose(): void {
    this.stopSource();
    this.analyser.disconnect();
    this.gain.disconnect();
    void this.ctx.close();
  }
}
