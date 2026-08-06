/**
 * GLSL for the "Gold" particle field, ported from the original prototype.
 *
 * Particle displacement happens entirely in the vertex shader off a 3D simplex
 * noise field, pulsed by bass (uBass) with treble (uTreble) driving point size.
 * This is the efficient pattern: 15k+ points, one draw call, zero per-frame CPU
 * work over vertices. The fragment shader shades soft round sprites through a
 * banded D→C→B gradient with white highlights at noise peaks.
 */

export const simplexNoiseGLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - 1.0 + C.xxx;
    i = mod289(i);
    vec4 p = permute( permute( permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }
`;

export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uTreble;
  uniform float uBeat;
  uniform float uPixelRatio;
  varying float vNoise;
  varying vec3 vPos;

  ${simplexNoiseGLSL}

  void main() {
    vec3 p = position;
    float time = uTime * 0.3;
    float noiseVal = snoise(vec3(p.x * 0.8, p.y * 0.8, p.z * 0.8 + time));
    // normalize() is undefined at the origin — guard against the rare sample
    // landing on (0,0,0), which would produce a NaN position.
    vec3 direction = p / max(length(p), 1e-4);

    // Bass drives the expansion; the beat adds a percussive kick on top, and
    // noise keeps it fluid, not stiff.
    float pulse = uBass * 1.8 + uBeat * 0.6;
    float fluid = noiseVal * (0.1 + uBass * 0.8);
    vec3 newPos = p + direction * (pulse + fluid);

    vNoise = noiseVal;
    vPos = newPos;

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Treble adds sparkle size; beats pump it; perspective keeps near points
    // larger (bokeh). gl_PointSize is in device pixels: uPixelRatio keeps the
    // apparent size constant across display densities and adaptive-resolution
    // changes.
    gl_PointSize = (9.9 + uTreble * 12.0 + uBeat * 4.0) * uPixelRatio * (1.0 / -mvPosition.z);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform vec3 uColorD;
  varying float vNoise;
  varying vec3 vPos;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    float n = vNoise * 0.5 + 0.5;
    float depth = smoothstep(-2.0, 2.0, vPos.z);

    // Banded gradient (D->C->B) avoids muddy mixing of contrasting hues.
    float t = clamp(n + depth * 0.2, 0.0, 1.0);
    vec3 baseColor;
    if (t < 0.5) {
      baseColor = mix(uColorD, uColorC, t * 2.0);
    } else {
      baseColor = mix(uColorC, uColorB, (t - 0.5) * 2.0);
    }

    vec3 color = baseColor;
    if (n > 0.7) {
      color = mix(baseColor, uColorA, (n - 0.7) * 3.3);
    }
    gl_FragColor = vec4(color, alpha * 0.95);
  }
`;
