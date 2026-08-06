import type * as THREE from 'three';
import type { AudioFrame } from './audio/AudioFrame';

/**
 * Anything the Engine can drive. It exposes a scene + camera for the shared
 * post-processing chain and an `update` called once per frame with the
 * engine's delta, absolute time, and the shared audio frame.
 *
 * Effects (see effects/Effect.ts) extend this. Time and audio always arrive
 * from the engine — never wall-clock or a live analyser — which is what makes
 * deterministic offline export possible.
 */
export interface Renderable {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  update(dt: number, t: number, audio: AudioFrame): void;
  resize?(w: number, h: number): void;
  dispose?(): void;
}
