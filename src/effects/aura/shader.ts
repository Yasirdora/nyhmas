/**
 * GLSL for "Aura" — a sphere of flowing light, built on the proven particle
 * recipe: one Points draw call, all motion in the vertex shader, soft
 * additive sprites, HDR feeding the bloom pass.
 *
 * The fluid feel comes from shear: nested shells stream around the sphere at
 * different angular speeds (fast at the equator, creeping at the poles),
 * while each particle's latitude wanders on slow simplex noise, so the bands
 * braid and fold like silk instead of rotating as a rigid body. Bass speeds
 * and swells the currents, the spectrum envelope brightens them by
 * longitude, treble shimmers, and the beat pops the whole sphere.
 */
import { simplexNoiseGLSL } from '../goldParticles/shader';

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uPixelRatio;
  uniform sampler2D uSpec;

  /** Unit direction on the sphere (the particle's home shell point). */
  attribute vec3 aHome;
  /** x: shell radius (0.5..1), y/z: noise seeds. */
  attribute vec3 aInfo;
  attribute float aRand;

  varying float vBand;
  varying float vChurn;
  varying float vSpec;
  varying float vTwinkle;
  varying float vViewZ;

  ${simplexNoiseGLSL}

  void main() {
    float r = aInfo.x;
    float lat0 = asin(clamp(aHome.y, -1.0, 1.0));
    float lon0 = atan(aHome.z, aHome.x);

    // Shear: equator streams fastest, poles creep — the fluid look. Bass
    // speeds every current.
    float swirl = 0.3 + uBass * 0.2;
    float speed = swirl / (0.35 + lat0 * lat0 * 2.2);
    float lon = lon0 + uTime * speed;

    // Bands wander and braid on slow noise — silk, never rigid.
    float wander = snoise(vec3(aHome.x * 2.0 + aInfo.y * 10.0, aHome.y * 2.0, uTime * 0.15));
    float lat = lat0 + wander * 0.13;

    // Radial churn: shells breathe with bass, ripple with slow noise.
    float churn = snoise(vec3(aHome.x * 3.0, aHome.y * 3.0 + aInfo.z * 20.0, uTime * 0.22));
    float rr = r * (1.0 + uBass * 0.12 + churn * (0.03 + uBass * 0.06));

    vec3 newPos = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)) * rr;

    // The currents brighten where the music is loud, by longitude.
    float spec = texture2D(uSpec, vec2(fract(lon / 6.2831853), 0.5)).r;

    vBand = lat0;
    vChurn = churn;
    vSpec = spec;
    vTwinkle = 0.8 + 0.2 * sin(uTime * (1.5 + aRand * 3.0) + aRand * 39.0);

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vViewZ = -mvPosition.z;

    // gl_PointSize is in device pixels: uPixelRatio keeps apparent size
    // constant across display densities and adaptive-resolution changes.
    float size = mix(5.0, 8.0, aRand) * (1.0 + uTreble * 0.9 + spec * 0.4 + uBeat * 0.3);
    gl_PointSize = size * uPixelRatio * (1.0 / -mvPosition.z);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  uniform float uTreble;

  varying float vBand;
  varying float vChurn;
  varying float vSpec;
  varying float vTwinkle;
  varying float vViewZ;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.25, 0.5, dist);

    // Flowing bands: poles cool blue, mid-latitudes ember, the equatorial
    // stream gold — with churn stirring white into the fold lines.
    float t = clamp(1.0 - abs(vBand) * 1.05 + vChurn * 0.2, 0.0, 1.0);
    vec3 color = t < 0.5
      ? mix(uColorD, uColorC, t * 2.0)
      : mix(uColorC, uColorB, (t - 0.5) * 2.0);
    if (vChurn > 0.4) {
      color = mix(color, uColorA, (vChurn - 0.4) * 1.5);
    }

    // Where the music lifts the currents, they warm toward white-gold.
    color = mix(color, uColorA * vec3(1.15, 1.05, 0.85), vSpec * vSpec * 0.5);

    // Far side dims into the dark; treble wakes the shimmer.
    float depth = smoothstep(5.0, 8.5, vViewZ);
    float lum = mix(1.0, 0.5, depth) * mix(1.0, vTwinkle, 0.2 + uTreble * 0.6);

    gl_FragColor = vec4(color * lum, alpha * 0.9);
  }
`;
