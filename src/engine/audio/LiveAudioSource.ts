import type { AudioEngine } from './AudioEngine';
import { AudioFrame } from './AudioFrame';
import type { AudioSource } from './AudioSource';

/**
 * Real-time audio source: pulls the current spectrum and waveform from the
 * engine's AnalyserNode each frame. Used during live playback. The `t`
 * argument is ignored — the analyser already reflects "now".
 */
export class LiveAudioSource implements AudioSource {
  readonly frame: AudioFrame;

  constructor(private readonly engine: AudioEngine) {
    const analyser = engine.analyser;
    // Spectrum width = frequencyBinCount (fftSize/2); waveform width = fftSize.
    this.frame = new AudioFrame(analyser.frequencyBinCount, analyser.fftSize);
  }

  update(_t: number): void {
    const analyser = this.engine.analyser;
    if (this.engine.isPlaying) {
      analyser.getByteFrequencyData(this.frame.rawSpectrum);
      analyser.getByteTimeDomainData(this.frame.rawWaveform);
      this.frame.commit(
        this.engine.ctx.sampleRate,
        analyser.fftSize,
        this.engine.currentTime,
        this.engine.duration,
      );
    } else {
      // Keep time/progress current so a paused scrub still reads right.
      this.frame.time = this.engine.currentTime;
      this.frame.duration = this.engine.duration;
    }
  }

  dispose(): void {
    this.frame.dispose();
  }
}
