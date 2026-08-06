import * as THREE from 'three';
import type { AudioFrame } from '../audio/AudioFrame';
import type { BloomConfig } from '../postfx/PostFX';
import type { Effect, EffectMeta, EngineContext } from './Effect';

/** Fullscreen clip-space quad — no camera transform needed. */
const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

/**
 * Standard uniforms every ShaderEffect receives, updated each frame:
 *   uTime, uResolution, uSpectrum (tex), uWaveform (tex),
 *   uBass, uMid, uTreble, uEnergy, uBeat.
 * A 2D effect's fragment shader just declares and samples what it needs.
 */
export abstract class ShaderEffect implements Effect {
  abstract readonly meta: EffectMeta;

  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();

  protected readonly uniforms: Record<string, THREE.IUniform>;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;

  /** Optional per-effect bloom; applied in init(). */
  protected bloom?: Partial<BloomConfig> & { enabled?: boolean };

  constructor(
    width: number,
    height: number,
    fragmentShader: string,
    extraUniforms: Record<string, THREE.IUniform> = {},
  ) {
    this.uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uSpectrum: { value: null },
      uWaveform: { value: null },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uEnergy: { value: 0 },
      uBeat: { value: 0 },
      ...extraUniforms,
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  init(ctx: EngineContext): void {
    if (this.bloom) {
      ctx.postfx.setBloom(this.bloom);
      if (this.bloom.enabled !== undefined) ctx.postfx.setBloomEnabled(this.bloom.enabled);
    }
    this.onInit?.(ctx);
  }

  update(dt: number, t: number, audio: AudioFrame): void {
    const u = this.uniforms;
    u.uTime!.value = t;
    u.uSpectrum!.value = audio.spectrum;
    u.uWaveform!.value = audio.waveform;
    u.uBass!.value = audio.bands.bass;
    u.uMid!.value = audio.bands.mid;
    u.uTreble!.value = audio.bands.treble;
    u.uEnergy!.value = audio.bands.energy;
    u.uBeat!.value = audio.bands.beat;
    this.onUpdate?.(dt, t, audio);
  }

  resize(width: number, height: number): void {
    (this.uniforms.uResolution!.value as THREE.Vector2).set(width, height);
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.scene.clear();
  }

  /** Optional hooks for subclasses. */
  protected onInit?(ctx: EngineContext): void;
  protected onUpdate?(dt: number, t: number, audio: AudioFrame): void;
}
