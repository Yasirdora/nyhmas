import * as THREE from 'three';
import type { EffectMeta } from '../../engine/effects/Effect';
import { ParticleEffect } from '../../engine/effects/ParticleEffect';
import { fragmentShader, vertexShader } from './shader';

/** Share of particles forming the silhouette shell; the rest fill the core. */
const SHELL_RATIO = 0.65;

/**
 * "Orb" — a living sphere of light that listens. A fibonacci shell draws the
 * silhouette while a dense core stacks into a hot heart; a two-octave simplex
 * flow keeps the surface liquid, bass breathes the body, treble wakes a
 * shimmer, and the circular spectrum envelope raises slow bulges where the
 * music is loud.
 */
export class Orb extends ParticleEffect {
  readonly meta: EffectMeta = {
    id: 'orb',
    title: 'Orb',
    kind: '3d',
    description: 'A sphere of light that listens — breathing with the bass, singing in gold.',
  };

  constructor(width: number, height: number) {
    super(width, height, {
      vertexShader,
      fragmentShader,
      geometry: createOrbGeometry,
      countByTier: { low: 6000, medium: 12_000, high: 18_000 },
      scale: 1.55,
      spin: 0.08,
      beatPop: 0.08,
      spectrum: true,
      energy: 'smooth',
      // Slightly lower threshold than Gold so the dense core breathes light.
      bloom: { strength: 1.8, radius: 1.3, threshold: 0.9 },
      // The orb rotates itself (deterministically) — no camera auto-rotate.
      scene: { cameraZ: 6, autoRotate: false, fogDensity: 0.02 },
    });
  }
}

/**
 * Fibonacci-distributed shell (uniform silhouette, no polar clumping) plus a
 * centre-weighted core whose additive stacking becomes the orb's hot heart.
 */
function createOrbGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const shellCount = Math.round(count * SHELL_RATIO);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    let z: number;
    if (i < shellCount) {
      const yy = 1 - (i / (shellCount - 1)) * 2;
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const theta = goldenAngle * i;
      const radius = 0.94 + Math.random() * 0.08;
      x = Math.cos(theta) * rr * radius;
      y = yy * radius;
      z = Math.sin(theta) * rr * radius;
    } else {
      // Core: a centre-weighted cluster — the dense middle becomes the glow.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = Math.random() ** 2.2 * 0.9;
      x = Math.sin(phi) * Math.cos(theta) * radius;
      y = Math.cos(phi) * radius;
      z = Math.sin(phi) * Math.sin(theta) * radius;
    }
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    randoms[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(randoms, 1));
  return geometry;
}
