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
    description: 'A curtain of flowing light — luminous ribbons waving like the northern lights.',
  };

  constructor(width: number, height: number) {
    super(width, height, {
      vertexShader,
      fragmentShader,
      geometry: createAuraGeometry,
      countByTier: { low: 9000, medium: 16_000, high: 22_000 },
      scale: 2.1,
      tilt: 0.05,
      spin: 0,
      beatPop: 0.04,
      spectrum: true,
      // Bloom tuned for silky curtain glow
      bloom: { strength: 2.2, radius: 1.8, threshold: 0.8 },
      scene: { cameraZ: 5.5, autoRotate: false, fogDensity: 0.02 },
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

  for (let i = 0; i < count; i++) {
    // Distribute particles across a wide ribbon/curtain
    const x = (Math.random() - 0.5) * 10.0;
    
    // Y goes from bottom to top, densely packed at the bottom for the bright aurora edge
    const yFactor = Math.random();
    const y = (Math.pow(yFactor, 1.5) - 0.5) * 4.0; 
    
    // Z is a small random thickness
    const z = (Math.random() - 0.5) * 0.2;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    // In homes, we store the normalized height in y for color mapping
    homes[i * 3] = x;
    homes[i * 3 + 1] = yFactor;
    homes[i * 3 + 2] = z;
    
    infos[i * 3] = Math.random();
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
