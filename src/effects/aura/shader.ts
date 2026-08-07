/**
 * GLSL for "Aura" (Aurora) — a stunning, multi-layered aurora curtain.
 * Features 3 nested atmospheric layers (front green/cyan, mid teal/purple, back purple/magenta)
 * drifting and folding at dynamic speeds, with rising vertical ray streaks
 * and beautiful depth parallax.
 */
import { simplexNoiseGLSL } from '../goldParticles/shader';

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uPixelRatio;
  uniform sampler2D uSpec;

  /** Home coordinates on flat curtain plane. */
  attribute vec3 aHome;
  /** x/y/z: random noise seeds. */
  attribute vec3 aInfo;
  attribute float aRand;

  varying float vBand;      // Normalized height (0..1)
  varying float vChurn;     // Ray/intensity detail
  varying float vSpec;      // Spectrum amplitude
  varying float vTwinkle;   // Twinkle variance
  varying float vViewZ;     // Depth for camera effects
  varying float vLayer;     // Curtain layer index (0, 1, 2)

  ${simplexNoiseGLSL}

  void main() {
    float x0 = aHome.x; // Range: -5.0 to 5.0
    float yNormalized = aHome.y; // 0.0 (bottom) to 1.0 (top)
    float z0 = aHome.z;

    // Split into 3 layered curtains for jaw-dropping depth parallax
    float layer = floor(aRand * 3.0);
    float phase = layer * 15.71;

    // Curved Auroral Arch: wraps around the camera in depth
    float arcAngle = (x0 / 5.0) * 0.8;
    float arcRadius = 4.5 + (layer - 1.0) * 0.45; // Offset layer depths
    
    float baseArcX = sin(arcAngle) * arcRadius;
    float baseArcZ = cos(arcAngle) * arcRadius - arcRadius;

    // Wave speed and horizontal drift per layer
    float waveSpeed = 0.07 + layer * 0.04 + uBass * 0.08;
    float wave1 = snoise(vec3(x0 * 0.35 - uTime * waveSpeed, yNormalized * 0.2 + phase, uTime * 0.04));
    float wave2 = snoise(vec3(x0 * 1.1 + uTime * (waveSpeed * 1.4), yNormalized * 0.5 + phase, uTime * 0.08));
    
    // Vertical ray strands that rise upward along the curtain
    float rayFreq = 7.0 + layer * 2.0;
    float rayRiseSpeed = 0.4 + layer * 0.25;
    float rayNoise = snoise(vec3(x0 * rayFreq, yNormalized * 1.4 - uTime * rayRiseSpeed, phase));
    float rayIntensity = max(0.0, rayNoise);

    // Total displacement: waving folds and ray offsets
    float waveZ = (wave1 * 1.0 + wave2 * 0.3) * (0.25 + yNormalized * 0.75);
    
    // Giant slow height wave
    float heightWave = snoise(vec3(x0 * 0.4 + phase, uTime * 0.07, 0.0)) * 0.25;
    
    // Bass swells the curtain height
    float finalY = (yNormalized * (3.1 + uBass * 0.9) - 1.55) + heightWave;

    float finalX = baseArcX + rayIntensity * 0.06;
    float finalZ = baseArcZ + z0 + waveZ;

    vec3 newPos = vec3(finalX, finalY, finalZ);

    // Audio reactivity - spectrum envelope along the arch
    float spec = texture2D(uSpec, vec2(fract((x0 + 5.0) / 10.0), 0.5)).r;

    vBand = yNormalized;
    vChurn = rayIntensity * (0.7 + wave2 * 0.3);
    vSpec = spec;
    vTwinkle = 0.8 + 0.2 * sin(uTime * (2.0 + aRand * 4.0) + aRand * 50.0);
    vLayer = layer;

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vViewZ = -mvPosition.z;

    // Particles stretch larger where the rays are active and music is pumping
    float size = mix(3.5, 6.5, aRand) * (1.0 + uTreble * 1.0 + spec * 0.6 + rayIntensity * 0.3);
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
  varying float vLayer;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    
    // Silky smooth light particles
    float alpha = exp(-dist * dist * 12.0);

    // Multi-spectral Aurora Palette:
    // Layer 0 (Back): Purple/Indigo to Magenta/Pink
    // Layer 1 (Middle): Teal/Cyan to Purple
    // Layer 2 (Front): Bright Neon Green to Cyan
    vec3 green = vec3(0.02, 1.0, 0.3);
    vec3 teal = vec3(0.0, 0.9, 0.7);
    vec3 cyan = vec3(0.0, 0.75, 1.0);
    vec3 purple = vec3(0.55, 0.1, 0.95);
    vec3 magenta = vec3(0.95, 0.1, 0.55);
    vec3 whiteCore = vec3(0.9, 1.0, 0.95);

    vec3 bottomColor;
    vec3 topColor;

    if (vLayer == 0.0) {
      bottomColor = purple;
      topColor = magenta;
    } else if (vLayer == 1.0) {
      bottomColor = teal;
      topColor = purple;
    } else {
      bottomColor = green;
      topColor = cyan;
    }

    // Blend gradient bottom-to-top
    vec3 color = mix(bottomColor, topColor, vBand);

    // Fold/Ray highlights
    if (vChurn > 0.3) {
      color = mix(color, whiteCore, (vChurn - 0.3) * 1.2);
    }

    // Reactivity boosts core brightness
    color = mix(color, whiteCore * 1.4, vSpec * vSpec * 0.7);

    // Realistic atmospheric fade-off
    float topFade = 1.0 - smoothstep(0.65, 1.0, vBand);
    float bottomFade = smoothstep(0.0, 0.08, vBand);
    
    float layerAlpha = vLayer == 0.0 ? 0.55 : (vLayer == 1.0 ? 0.8 : 1.0);
    
    alpha *= topFade * bottomFade * layerAlpha;

    // Distance attenuation and twinkle shimmer
    float depth = smoothstep(4.0, 8.5, vViewZ);
    float lum = mix(1.0, 0.55, depth) * mix(1.0, vTwinkle, 0.15 + uTreble * 0.6);

    gl_FragColor = vec4(color * lum, alpha * 0.85);
  }
`;
