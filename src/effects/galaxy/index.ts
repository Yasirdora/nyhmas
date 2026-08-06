import * as THREE from 'three';
import type { EffectMeta } from '../../engine/effects/Effect';
import { ParticleEffect } from '../../engine/effects/ParticleEffect';
import { fragmentShader, vertexShader } from './shader';

/** Population split: churning corona / spiral-arm disk / distant halo stars. */
const CORE_RATIO = 0.1;
const DISK_RATIO = 0.75;
// Remainder is halo.

/** Fixed tilt of the disk toward the viewer — sells the 3D and the eclipse. */
const DISK_TILT = 0.42;

/** The void: radius of the opaque black sphere at the centre. */
const HOLE_RADIUS = 0.82;

/** Spiral arm count and how tightly they wind (radians of twist per radius). */
const ARM_COUNT = 3;
const ARM_TWIST = 1.15;

/**
 * Kepler-ish angular speed: inner orbits whip, outer ones drift. The constant
 * sets the inner-corona churn rate (~0.8 rad/s at r = 0.5).
 */
const orbitSpeed = (radius: number) => 0.28 / Math.max(radius, 0.35) ** 1.5;

/**
 * "Galaxy" — a black hole wrapped in a swirling spiral galaxy. Three particle
 * populations share one draw call: a churning corona hugging the void, three
 * spiral arms in differential (Kepler-ish) rotation, and a distant halo of
 * twinkling stars. An opaque black sphere at the centre occludes whatever
 * passes behind it, so the glowing disk wraps a true void — the eclipse look.
 */
export class Galaxy extends ParticleEffect {
  readonly meta: EffectMeta = {
    id: 'galaxy',
    title: 'Galaxy',
    kind: '3d',
    description: 'A black hole wrapped in a swirling galaxy — stars, dust and light in orbit.',
  };

  constructor(width: number, height: number) {
    super(width, height, {
      vertexShader,
      fragmentShader,
      geometry: createGalaxyGeometry,
      countByTier: { low: 7000, medium: 14_000, high: 20_000 },
      scale: 1.35,
      tilt: DISK_TILT,
      spin: 0.02,
      beatPop: 0.07,
      spectrum: true,
      energy: 'raw',
      // The photon ring and corona are what bloom catches.
      bloom: { strength: 1.8, radius: 1.3, threshold: 0.85 },
      // The galaxy rotates itself (deterministically) — no camera auto-rotate.
      scene: { cameraZ: 6, autoRotate: false, fogDensity: 0.02 },
      onBuild: (scene) => {
        // The void. Opaque, so it renders before the transparent particles and
        // writes depth — anything passing behind it is hidden, and the additive
        // glow of the disk wraps around a pitch-black silhouette.
        const hole = new THREE.Mesh(
          new THREE.SphereGeometry(HOLE_RADIUS, 48, 32),
          new THREE.MeshBasicMaterial({ color: 0x000000 }),
        );
        scene.add(hole);
      },
    });
  }
}

/** Box-Muller gaussian, clamped — natural clumping without stray outliers. */
function gauss(): number {
  const u = Math.max(Math.random(), 1e-6);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.5;
}

/**
 * Builds the three populations. `position` carries only the vertical offset
 * (y); the shader derives x/z from the orbit attributes each frame, so the
 * whole galaxy moves with zero per-frame CPU work.
 */
function createGalaxyGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const orbits = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const coreCount = Math.round(count * CORE_RATIO);
  const diskCount = Math.round(count * DISK_RATIO);

  for (let i = 0; i < count; i++) {
    let radius: number;
    let phase: number;
    let y: number;
    let speed: number;

    if (i < coreCount) {
      // Corona: a tight, hot ball hugging the void.
      radius = 0.35 + Math.random() * 0.5;
      phase = Math.random() * Math.PI * 2;
      y = gauss() * 0.22;
      speed = orbitSpeed(radius);
    } else if (i < coreCount + diskCount) {
      // Spiral arms: logarithmic twist, puffier toward the rim.
      const t = Math.random() ** 0.65;
      radius = 0.9 + t * 2.6;
      const arm = i % ARM_COUNT;
      phase = (arm / ARM_COUNT) * Math.PI * 2 + radius * ARM_TWIST + gauss() * 0.28 * (1.4 - t);
      y = gauss() * (0.05 + t * 0.1);
      speed = orbitSpeed(radius);
    } else {
      // Halo: a distant, slow sphere of background stars.
      radius = 4 + Math.random() * 4.5;
      phase = Math.random() * Math.PI * 2;
      y = gauss() * radius * 0.55;
      speed = orbitSpeed(radius) * 0.15;
    }

    positions[i * 3] = 0;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;
    orbits[i * 3] = radius;
    orbits[i * 3 + 1] = phase;
    orbits[i * 3 + 2] = speed;
    randoms[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aOrbit', new THREE.BufferAttribute(orbits, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(randoms, 1));
  return geometry;
}
