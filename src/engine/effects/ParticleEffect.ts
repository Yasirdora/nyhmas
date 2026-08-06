import * as THREE from 'three';
import type { AudioFrame } from '../audio/AudioFrame';
import { CircularSpectrum } from '../audio/CircularSpectrum';
import type { BloomConfig } from '../postfx/PostFX';
import { approach } from '../smoothing';
import type { QualityTier } from '../types';
import type { EngineContext } from './Effect';
import { Scene3DEffect, type Scene3DOptions } from './Scene3DEffect';

/**
 * The shared NYHMAS particle palette: white core light, gold body, red warmth,
 * cool blue contrast. One brand language across every particle effect.
 */
export const PARTICLE_PALETTE = {
  a: '#ffffff',
  b: '#f6952d',
  c: '#f35252',
  d: '#6ac1fb',
} as const;

/**
 * Per-second smoothing for bass/treble easing — equivalent to the per-frame
 * f = 0.15 at 120Hz (τ ≈ 50ms). Deliberately snappier than the 60fps
 * equivalent: that's the responsive feel these effects are tuned for. Being
 * dt-based, it stays identical live and in exports.
 */
const REACT_RATE = -120 * Math.log(0.85);

/** Energy follows far slower so glow swells and fades gracefully. */
const ENERGY_RATE = 4;

export interface ParticleEffectConfig {
  vertexShader: string;
  fragmentShader: string;
  /** Build the point-cloud geometry for the active quality tier's count. */
  geometry: (count: number) => THREE.BufferGeometry;
  /** Particle count per quality tier — fill rate is the cost, so scale it. */
  countByTier: Record<QualityTier, number>;
  /** Master world-unit scale of the point cloud on screen. */
  scale: number;
  /** The effect's signature bloom recipe. */
  bloom: BloomConfig;
  /** Fixed X tilt (radians) so structures read as 3D. Default 0. */
  tilt?: number;
  /** Constant Y spin (rad/s), derived from t so exports match live. Default 0. */
  spin?: number;
  /** Beat "pop": fractional scale jump on bass onsets. Default 0. */
  beatPop?: number;
  /** Add the circular spectrum envelope as `uSpec` (longitude-reactive). */
  spectrum?: boolean;
  /** How the `uEnergy` uniform is fed: raw, smoothed, or omitted (default). */
  energy?: 'raw' | 'smooth' | 'none';
  /** Idle breathing pulse (base + wave·sin) so the field is alive in silence. */
  idlePulse?: { base: number; wave: number };
  /** Idle treble shimmer in silence. Default 0.25. */
  idleSparkle?: number;
  /** Forwarded to Scene3DEffect (camera, fog, controls). */
  scene?: Scene3DOptions;
  /** Add extra scene objects after the points (e.g. Galaxy's black hole). */
  onBuild?: (scene: THREE.Scene) => void;
}

/** Config with every optional resolved — what the base actually reads. */
interface ResolvedParticleConfig {
  vertexShader: string;
  fragmentShader: string;
  geometry: (count: number) => THREE.BufferGeometry;
  countByTier: Record<QualityTier, number>;
  scale: number;
  bloom: BloomConfig;
  tilt: number;
  spin: number;
  beatPop: number;
  spectrum: boolean;
  energy: 'raw' | 'smooth' | 'none';
  idlePulse: { base: number; wave: number };
  idleSparkle: number;
  onBuild?: (scene: THREE.Scene) => void;
}

/**
 * Base class for the signature look: one point cloud of light on deep black,
 * breathing with bass, sparkling on treble, HDR bloom as atmosphere.
 *
 * It owns everything the particle effects share — uniforms, palette, idle
 * breathing, dt-based reaction smoothing, the circular spectrum texture, pixel-
 * ratio-correct sprite sizing, spin/tilt/beat-pop — so a concrete effect only
 * supplies its shaders, geometry, and tuning. Motion derives from engine time
 * and the AudioFrame, never wall-clock, so exports reproduce live frames
 * exactly.
 */
export abstract class ParticleEffect extends Scene3DEffect {
  protected material!: THREE.ShaderMaterial;
  protected points!: THREE.Points;

  private threeRenderer!: THREE.WebGLRenderer;
  private smoothBass = 0;
  private smoothTreble = 0;
  private smoothEnergy = 0;
  private spectrum: CircularSpectrum | null = null;

  private readonly cfg: ResolvedParticleConfig;

  constructor(width: number, height: number, config: ParticleEffectConfig) {
    super(width, height, config.scene);
    this.cfg = {
      vertexShader: config.vertexShader,
      fragmentShader: config.fragmentShader,
      geometry: config.geometry,
      countByTier: config.countByTier,
      scale: config.scale,
      bloom: config.bloom,
      tilt: config.tilt ?? 0,
      spin: config.spin ?? 0,
      beatPop: config.beatPop ?? 0,
      spectrum: config.spectrum ?? false,
      energy: config.energy ?? 'none',
      idlePulse: config.idlePulse ?? { base: 0.14, wave: 0.08 },
      idleSparkle: config.idleSparkle ?? 0.25,
      onBuild: config.onBuild,
    };
  }

  protected build(ctx: EngineContext): void {
    this.threeRenderer = ctx.renderer;
    if (this.cfg.spectrum) this.spectrum = new CircularSpectrum();

    const geometry = this.cfg.geometry(this.cfg.countByTier[ctx.tier]);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uTreble: { value: 0 },
        uBeat: { value: 0 },
        uEnergy: { value: 0 },
        uPixelRatio: { value: 1 },
        uSpec: { value: this.spectrum?.texture ?? null },
        uColorA: { value: new THREE.Color(PARTICLE_PALETTE.a) },
        uColorB: { value: new THREE.Color(PARTICLE_PALETTE.b) },
        uColorC: { value: new THREE.Color(PARTICLE_PALETTE.c) },
        uColorD: { value: new THREE.Color(PARTICLE_PALETTE.d) },
      },
      vertexShader: this.cfg.vertexShader,
      fragmentShader: this.cfg.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.scale.setScalar(this.cfg.scale);
    this.points.rotation.x = this.cfg.tilt;
    // Vertex shaders displace points well past the static geometry's bounds —
    // skip the (wrong) frustum test and its bounding-sphere compute.
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.cfg.onBuild?.(this.scene);
    ctx.postfx.setBloom(this.cfg.bloom);
  }

  protected onUpdate(dt: number, t: number, audio: AudioFrame): void {
    const { bass, treble, energy, beat } = audio.bands;
    const cfg = this.cfg;

    // Idle "breathing" so the field is alive before/without audio; it fades out
    // as the track gets louder (quiet = 1 when silent, 0 when loud).
    const quiet = 1 - Math.min(1, energy * 5);
    const idlePulse = (cfg.idlePulse.base + cfg.idlePulse.wave * Math.sin(t * 0.9)) * quiet;
    const idleSparkle = cfg.idleSparkle * quiet;

    // Smooth toward targets so motion is fluid, not jittery — dt-based, so the
    // response is the same on 120Hz displays and in the 60fps export.
    this.smoothBass = approach(this.smoothBass, Math.max(bass, idlePulse), REACT_RATE, dt);
    this.smoothTreble = approach(this.smoothTreble, Math.max(treble, idleSparkle), REACT_RATE, dt);
    if (cfg.energy === 'smooth') {
      this.smoothEnergy = approach(this.smoothEnergy, energy, ENERGY_RATE, dt);
    }

    this.spectrum?.update(dt, audio);

    const u = this.material.uniforms;
    u.uTime!.value = t;
    u.uBass!.value = this.smoothBass;
    u.uTreble!.value = this.smoothTreble;
    u.uEnergy!.value = cfg.energy === 'raw' ? energy : this.smoothEnergy;
    // The beat pulse decays on its own — feed it raw so kicks stay percussive.
    u.uBeat!.value = beat;
    // Point sprites are sized in device pixels, so scale by the current pixel
    // ratio — otherwise particles shrink on retina displays and whenever
    // adaptive resolution changes the buffer size.
    u.uPixelRatio!.value = this.threeRenderer.getPixelRatio();

    // Spin and beat-pop derive from t/beat only, so exports match live exactly.
    if (cfg.spin !== 0) this.points.rotation.y = t * cfg.spin;
    if (cfg.beatPop !== 0) this.points.scale.setScalar(cfg.scale * (1 + beat * cfg.beatPop));
  }

  override dispose(): void {
    this.spectrum?.dispose();
    super.dispose();
  }
}
