import type * as THREE from 'three';
import type { PostFX } from '../postfx/PostFX';
import type { Renderable } from '../Renderable';
import type { QualityTier } from '../types';

export interface EffectMeta {
  /** Stable id used by the registry and URL/state. */
  id: string;
  /** Human title shown in the picker. */
  title: string;
  /** 2D full-screen shader vs 3D scene — informs which base class is used. */
  kind: '2d' | '3d';
  /** Short blurb for the picker card. */
  description?: string;
}

/**
 * What the engine hands an effect at init time. Effects use it to size buffers,
 * pick a quality tier, and tune the shared bloom for their look. They must not
 * stash `performance.now()` or a live analyser — time and audio arrive per
 * frame via `update`, so the same effect renders identically during export.
 */
export interface EngineContext {
  renderer: THREE.WebGLRenderer;
  postfx: PostFX;
  tier: QualityTier;
  width: number;
  height: number;
}

/**
 * The contract every visual implements. Extends Renderable (scene/camera/update)
 * and adds metadata plus async init (build materials, load shaders). Concrete
 * effects extend a base — Scene3DEffect (3D) or ShaderEffect (2D) — rather than
 * implementing this raw.
 */
export interface Effect extends Renderable {
  readonly meta: EffectMeta;
  init(ctx: EngineContext): void | Promise<void>;
  resize(width: number, height: number): void;
  dispose(): void;
}
