import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AudioFrame } from '../audio/AudioFrame';
import type { Effect, EffectMeta, EngineContext } from './Effect';

export interface Scene3DOptions {
  fov?: number;
  near?: number;
  far?: number;
  cameraZ?: number;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  /** FogExp2 density; 0 disables fog. */
  fogDensity?: number;
  enableControls?: boolean;
}

/**
 * Base class for 3D effects — the "3D host". Owns a scene, a perspective
 * camera, optional damped OrbitControls (auto-rotate, zoom off), and disposal.
 * Subclasses implement `build` (create meshes/materials) and `onUpdate` (react
 * to the per-frame AudioFrame). This keeps every 3D effect consistent and tiny.
 */
export abstract class Scene3DEffect implements Effect {
  abstract readonly meta: EffectMeta;

  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  protected controls?: OrbitControls;

  private readonly opts: Required<Scene3DOptions>;

  constructor(width: number, height: number, options: Scene3DOptions = {}) {
    this.opts = {
      fov: 75,
      near: 0.1,
      far: 100,
      cameraZ: 6,
      autoRotate: true,
      autoRotateSpeed: 1,
      fogDensity: 0.02,
      enableControls: true,
      ...options,
    };

    this.scene.background = new THREE.Color(0x000000);
    if (this.opts.fogDensity > 0) {
      this.scene.fog = new THREE.FogExp2(0x000000, this.opts.fogDensity);
    }

    this.camera = new THREE.PerspectiveCamera(
      this.opts.fov,
      width / height,
      this.opts.near,
      this.opts.far,
    );
    this.camera.position.set(0, 0, this.opts.cameraZ);
  }

  async init(ctx: EngineContext): Promise<void> {
    if (this.opts.enableControls) {
      this.controls = new OrbitControls(this.camera, ctx.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.autoRotate = this.opts.autoRotate;
      this.controls.autoRotateSpeed = this.opts.autoRotateSpeed;
      this.controls.enableZoom = false;
      this.controls.enablePan = false;
    }
    await this.build(ctx);
  }

  update(dt: number, t: number, audio: AudioFrame): void {
    this.onUpdate(dt, t, audio);
    this.controls?.update(dt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls?.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material?.dispose();
      }
    });
    this.scene.clear();
  }

  /** Build the scene contents. Called once from init. */
  protected abstract build(ctx: EngineContext): void | Promise<void>;

  /** Per-frame reaction to audio. Camera controls are updated automatically. */
  protected abstract onUpdate(dt: number, t: number, audio: AudioFrame): void;
}
