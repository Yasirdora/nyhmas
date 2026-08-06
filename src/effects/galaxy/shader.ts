/**
 * GLSL for "Galaxy" — a black hole wrapped in a swirling spiral galaxy, built
 * on the proven particle recipe: one Points draw call, all motion in the
 * vertex shader, soft additive sprites, HDR feeding the bloom pass.
 *
 * Each particle carries an orbit (radius, phase, speed) — inner orbits whip
 * around like an accretion disk, outer arms drift, the distant halo barely
 * moves. Bass breathes the disk and puffs its thickness, the circular
 * spectrum envelope brightens the arms by longitude, treble sparkles, and
 * the particles nearest the void are pushed white-hot: the photon ring.
 */
import { simplexNoiseGLSL } from '../goldParticles/shader';

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uEnergy;
  uniform float uPixelRatio;
  uniform sampler2D uSpec;

  /** x: orbit radius, y: phase, z: angular speed (rad/s). */
  attribute vec3 aOrbit;
  attribute float aRand;

  varying float vNoise;
  varying float vSpec;
  varying float vRadius;
  varying float vTwinkle;
  varying float vViewZ;

  ${simplexNoiseGLSL}

  void main() {
    float radius = aOrbit.x;
    float ang = aOrbit.y + uTime * aOrbit.z;

    // Stable noise seed from the initial phase so the flutter doesn't swim.
    float n = snoise(vec3(
      cos(aOrbit.y) * radius * 0.9,
      position.y * 3.0,
      sin(aOrbit.y) * radius * 0.9 + uTime * 0.15
    ));

    // Bass breathes the disk radially and puffs its thickness.
    float r = radius * (1.0 + uBass * 0.14 + n * (0.04 + uBass * 0.12));
    vec3 newPos = vec3(
      cos(ang) * r,
      position.y * (1.0 + n * 0.5 + uBass * 0.4),
      sin(ang) * r
    );

    // The arms brighten and swell where the music is loud, by longitude.
    // The distant halo is exempt — it stays a quiet starfield.
    float diskMask = smoothstep(3.6, 2.6, radius);
    float spec = texture2D(uSpec, vec2(fract(ang / 6.2831853), 0.5)).r * diskMask;
    newPos.xz *= 1.0 + spec * 0.10 * (0.3 + uEnergy);

    // Photon ring: particles nearest the void run white-hot.
    float rim = smoothstep(0.9, 0.5, radius);

    vNoise = n;
    vSpec = spec;
    vRadius = radius;
    // Halo stars twinkle always; disk particles shimmer with treble.
    vTwinkle = 0.8 + 0.2 * sin(uTime * (1.5 + aRand * 3.0) + aRand * 39.0);

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vViewZ = -mvPosition.z;

    // Core sprites big, disk medium, halo stars pin-pricks. gl_PointSize is
    // in device pixels: uPixelRatio keeps apparent size constant everywhere.
    float baseSize = radius < 1.0 ? mix(11.0, 7.0, radius) : (radius < 3.6 ? 5.5 : 2.5);
    baseSize *= 0.7 + aRand * 0.6;
    float coreMask = smoothstep(1.0, 0.6, radius);
    float size = baseSize * (1.0 + uTreble * 1.2 + rim * 0.6 + uBeat * 0.7 * coreMask);
    gl_PointSize = size * uPixelRatio * (1.0 / -mvPosition.z);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform float uTreble;
  uniform float uBeat;

  varying float vNoise;
  varying float vSpec;
  varying float vRadius;
  varying float vTwinkle;
  varying float vViewZ;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.25, 0.5, dist);

    float n = vNoise * 0.5 + 0.5;

    // Radial banding: gold heart → ember red arms → blue outer rim, with
    // noise variance so the arms aren't uniform.
    float t = clamp(smoothstep(0.4, 3.6, vRadius) + vNoise * 0.25, 0.0, 1.0);
    vec3 color = t < 0.5
      ? mix(uColorB, uColorC, t * 2.0)
      : mix(uColorC, uColorD, (t - 0.5) * 2.0);
    if (n > 0.7) {
      color = mix(color, uColorA, (n - 0.7) * 3.3);
    }

    // Photon ring (HDR — this is what bloom turns into the eclipse glow).
    float rim = smoothstep(0.9, 0.5, vRadius);
    color = mix(color, uColorA * vec3(1.25, 1.08, 0.82), rim * 0.85);
    // Beats make the ring flare — the eclipse pulse.
    color += uColorA * rim * uBeat * 0.5;

    // Where the music lifts the arms, they warm toward white-gold.
    color = mix(color, uColorA * vec3(1.1, 1.0, 0.85), vSpec * vSpec * 0.45);

    // Far side of the disk dims, halo stars twinkle, disk shimmers on treble.
    float depth = smoothstep(4.2, 7.6, vViewZ);
    float twinkleAmt = mix(0.2 + uTreble * 0.6, 1.0, smoothstep(3.6, 4.2, vRadius));
    float lum = mix(1.0, 0.6, depth) * mix(1.0, vTwinkle, twinkleAmt);

    gl_FragColor = vec4(color * lum, alpha * 0.9);
  }
`;
