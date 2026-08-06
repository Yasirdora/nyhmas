/**
 * GLSL for the "Orb" — a living sphere of light in the spirit of Siri /
 * ChatGPT's voice orb, built on the same proven recipe as Gold: one Points
 * draw call, simplex flow in the vertex shader, soft additive sprites, and
 * bloom doing the atmosphere.
 *
 * The sphere listens: a 64-point log-spectrum envelope (computed on the CPU
 * with attack/release smoothing, circular thanks to RepeatWrapping) is fetched
 * here by longitude, so loud passages raise slow travelling bulges in the
 * silhouette while bass breathes the whole body and treble wakes the shimmer.
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

  attribute float aRand;

  varying float vNoise;
  varying float vSpec;
  varying float vTwinkle;
  varying vec3 vPos;

  ${simplexNoiseGLSL}

  void main() {
    vec3 p = position;
    // normalize() is undefined at the origin — core points can sit near it.
    vec3 dir = p / max(length(p), 1e-4);

    // Two octaves of slow simplex flow: a large liquid undulation that drifts
    // through the sphere, plus fine detail so the surface never looks machined.
    float t = uTime * 0.28;
    float n = snoise(vec3(p.x * 1.6, p.y * 1.6, p.z * 1.6 + t)) * 0.75
            + snoise(vec3(p.x * 3.4 + t * 0.7, p.y * 3.4, p.z * 3.4)) * 0.25;

    // Circular spectrum: fetch the envelope by longitude (its texture wraps),
    // so a loud band becomes a bulge that travels around the sphere.
    float ang = atan(p.x, p.z) / 6.2831853 + 0.5;
    float spec = texture2D(uSpec, vec2(ang, 0.5)).r;

    float breathe = uBass * 0.45 + uBeat * 0.16;
    float fluid = n * (0.05 + uBass * 0.30);
    float bulge = spec * (0.06 + uEnergy * 0.30);

    vec3 newPos = p + dir * (breathe + fluid + bulge);

    vNoise = n;
    vSpec = spec;
    vPos = newPos;
    // Per-particle shimmer — mostly asleep until treble wakes it.
    vTwinkle = 0.8 + 0.2 * sin(uTime * (1.5 + aRand * 3.0) + aRand * 39.0);

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // gl_PointSize is in device pixels: uPixelRatio keeps apparent size
    // constant across display densities and adaptive-resolution changes.
    float size = mix(6.0, 10.0, aRand) * (1.0 + uTreble * 1.1 + spec * 0.35);
    gl_PointSize = size * uPixelRatio * (1.0 / -mvPosition.z);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform float uTreble;

  varying float vNoise;
  varying float vSpec;
  varying float vTwinkle;
  varying vec3 vPos;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.25, 0.5, dist);

    float n = vNoise * 0.5 + 0.5;
    float depth = smoothstep(-1.5, 1.5, vPos.z);

    // Banded D→C→B ramp (Gold's): contrasting hues stay clean, never muddy.
    float band = clamp(n + depth * 0.15, 0.0, 1.0);
    vec3 color = band < 0.5
      ? mix(uColorD, uColorC, band * 2.0)
      : mix(uColorC, uColorB, (band - 0.5) * 2.0);
    if (n > 0.7) {
      color = mix(color, uColorA, (n - 0.7) * 3.3);
    }

    // Where the spectrum lifts the shell, the light heats toward white-gold.
    color = mix(color, uColorA * vec3(1.1, 1.0, 0.85), vSpec * vSpec * 0.5);

    // Depth dimming sells the volume; twinkle adds the treble shimmer.
    float lum = mix(0.55, 1.0, depth) * mix(1.0, vTwinkle, 0.2 + uTreble * 0.6);
    gl_FragColor = vec4(color * lum, alpha * 0.9);
  }
`;
