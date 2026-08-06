import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Shared post-processing chain, owned by the Engine and reused across every
 * effect (never rebuilt per effect switch — only its source scene/camera are
 * reassigned).
 *
 * Bloom runs at the composer's full effective resolution by design. EffectComposer
 * owns pass sizing and re-propagates it on every setSize/setPixelRatio, so a
 * custom (e.g. half-res) pass size would be silently overridden on the next
 * resize anyway. The cost lever is the QualityManager instead: it scales the
 * whole chain's pixel ratio when the GPU falls behind. OutputPass performs tone
 * mapping + sRGB conversion as the final step.
 */
export interface BloomConfig {
  strength: number;
  radius: number;
  threshold: number;
}

export const DEFAULT_BLOOM: BloomConfig = {
  // Ported from the prototype's tuned look.
  strength: 2.0,
  radius: 1.6,
  threshold: 1.0,
};

export class PostFX {
  readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    bloom: BloomConfig = DEFAULT_BLOOM,
  ) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      bloom.strength,
      bloom.radius,
      bloom.threshold,
    );

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Point the chain at a different source scene/camera (on effect switch). */
  setScene(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.composer.setPixelRatio(ratio);
  }

  setBloom(config: Partial<BloomConfig>): void {
    if (config.strength !== undefined) this.bloom.strength = config.strength;
    if (config.radius !== undefined) this.bloom.radius = config.radius;
    if (config.threshold !== undefined) this.bloom.threshold = config.threshold;
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloom.enabled = enabled;
  }

  render(deltaSeconds: number): void {
    this.composer.render(deltaSeconds);
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
  }
}
