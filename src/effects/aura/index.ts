import * as THREE from 'three';
import type { EffectMeta } from '../../engine/effects/Effect';
import { ParticleEffect } from '../../engine/effects/ParticleEffect';
import { fragmentShader, vertexShader } from './shader';

/** Fixed tilt so the bands wrap visibly around the sphere — sells the 3D. */
const AURA_TILT = 0.42;

/**
 * "Aura" — a sphere of flowing light. Nested shells of particles stream
 * around the sphere at sheared angular speeds (equator fast, poles slow)
 * while their latitudes wander on slow noise, so the currents braid and fold
 * like silk — the Siri-orb fluidity. Bass speeds and swells the flow, the
 * spectrum envelope brightens currents by longitude, treble shimmers, the
 * beat pops. Poles run cool blue, the equatorial stream gold, fold lines
 * flash white.
 */
export class Aura extends ParticleEffect {
  readonly meta: EffectMeta = {
    id: 'aura',
    title: 'Aura',
    kind: '3d',
    description: 'A sphere of flowing light — luminous currents swirling like slow silk.',
  };

  constructor(width: number, height: number) {
    super(width, height, {
      vertexShader,
      fragmentShader,
      geometry: createAuraGeometry,
      countByTier: { low: 9000, medium: 16_000, high: 22_000 },
      scale: 2.1,
      tilt: AURA_TILT,
      spin: 0.06,
      beatPop: 0.06,
      spectrum: true,
      // Gold's exact bloom — the fold lines and equatorial stream catch it.
      bloom: { strength: 2.0, radius: 1.6, threshold: 1.0 },
      // The sphere flows on its own (deterministically) — no auto-rotate.
      scene: { cameraZ: 6, autoRotate: false, fogDensity: 0.02 },
    });
  }
}

/**
 * Nested shells with even direction coverage. `aHome` carries the unit
 * direction; `aInfo` the shell radius and noise seeds. All motion is derived
 * in-shader each frame, so the whole sphere flows with zero per-frame CPU
 * work.
 */
function createAuraGeometry(count: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const homes = new Float32Array(count * 3);
  const infos = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i++) {
    // Fibonacci-even directions, with a light jitter so shells don't moiré.
    const yy = 1 - (i / (count - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const theta = goldenAngle * i;
    const dx = Math.cos(theta) * rr + (Math.random() - 0.5) * 0.03;
    const dy = yy + (Math.random() - 0.5) * 0.03;
    const dz = Math.sin(theta) * rr + (Math.random() - 0.5) * 0.03;
    const len = Math.max(Math.hypot(dx, dy, dz), 1e-4);

    positions[i * 3] = dx;
    positions[i * 3 + 1] = dy;
    positions[i * 3 + 2] = dz;
    homes[i * 3] = dx / len;
    homes[i * 3 + 1] = dy / len;
    homes[i * 3 + 2] = dz / len;
    // Shells from the core out, biased outward so the flowing surface reads
    // lush instead of dusty — a thinner hot heart remains inside.
    infos[i * 3] = 0.5 + Math.random() ** 0.6 * 0.5;
    infos[i * 3 + 1] = Math.random();
    infos[i * 3 + 2] = Math.random();
    randoms[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aHome', new THREE.BufferAttribute(homes, 3));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(infos, 3));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(randoms, 1));
  return geometry;
}
