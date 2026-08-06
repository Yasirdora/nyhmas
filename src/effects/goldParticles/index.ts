import * as THREE from 'three';
import type { EffectMeta } from '../../engine/effects/Effect';
import { ParticleEffect } from '../../engine/effects/ParticleEffect';
import { fragmentShader, vertexShader } from './shader';

/**
 * "Gold" — a heart-shaped simplex-noise particle field that expands on bass and
 * sparkles on treble. The flagship effect; all shared behaviour (smoothing,
 * idle breathing, palette, bloom wiring) lives in ParticleEffect.
 */
export class GoldParticles extends ParticleEffect {
  readonly meta: EffectMeta = {
    id: 'gold-particles',
    title: 'Gold',
    kind: '3d',
    description: 'Heart-shaped noise field, expanding on bass, sparkling on treble.',
  };

  constructor(width: number, height: number) {
    super(width, height, {
      vertexShader,
      fragmentShader,
      geometry: createHeartGeometry,
      countByTier: { low: 8000, medium: 15_000, high: 22_000 },
      scale: 2.1,
      spin: 0.1,
      // Gold's idle breath is tuned slightly livelier than the shared default.
      idlePulse: { base: 0.16, wave: 0.09 },
      idleSparkle: 0.28,
      bloom: { strength: 2.0, radius: 1.6, threshold: 1.0 },
      scene: { cameraZ: 6, autoRotate: true, autoRotateSpeed: 1, fogDensity: 0.02 },
    });
  }
}

/**
 * Rejection-sample points inside the classic heart implicit surface.
 * Ported from the prototype.
 */
function createHeartGeometry(count: number): THREE.BufferGeometry {
  const positions: number[] = [];
  let i = 0;
  while (i < count) {
    const x = (Math.random() - 0.5) * 3;
    const y = (Math.random() - 0.5) * 3;
    const z = (Math.random() - 0.5) * 3;

    const term1 = x * x + (9 / 4) * z * z + y * y - 1;
    const term2 = x * x * (y * y * y);
    const term3 = (9 / 80) * z * z * (y * y * y);

    if (term1 * term1 * term1 - term2 - term3 < 0) {
      positions.push(x, y, z);
      i++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.center();
  return geometry;
}
