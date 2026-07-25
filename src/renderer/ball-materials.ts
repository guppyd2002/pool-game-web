/**
 * SDF ball material — CEO bake-off winner (Method C).
 * MeshPhysicalMaterial + onBeforeCompile injection:
 *   - object-space vObjPos varying → marks stay glued during roll (G1)
 *   - per-ball material clone + uAtlasRect uniform (G2)
 *   - solid 1-7,8: ±Z poles, two white-disc+number patches
 *   - stripe 9-15: white body + narrow color band at equator + equatorial number patches
 *   - cue 0: plain white, no injection
 */

import * as THREE from 'three';

// WPA regulation colors (CEO-approved from pool-viewer bake-off)
const WPA_COLORS: Record<number, number> = {
  1: 0xFFD400, 2: 0x1E3FAE, 3: 0xD62828, 4: 0x5B2A86,
  5: 0xE8730C, 6: 0x1B7B3A, 7: 0x7A1F1F, 8: 0x111111,
  9: 0xFFD400, 10: 0x1E3FAE, 11: 0xD62828, 12: 0x5B2A86,
  13: 0xE8730C, 14: 0x1B7B3A, 15: 0x7A1F1F,
};

const isStripe = (n: number): boolean => n >= 9 && n <= 15;

// ── Digit atlas (singleton canvas texture, 4×4 tile grid, numbers 1..15) ────
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;
const ATLAS_TILE  = 256;

let _atlas: THREE.CanvasTexture | null = null;

function getAtlas(): THREE.CanvasTexture {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas');
  c.width  = ATLAS_COLS * ATLAS_TILE;
  c.height = ATLAS_ROWS * ATLAS_TILE;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#111111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let n = 1; n <= 15; n++) {
    const col = n % ATLAS_COLS;
    const row = Math.floor(n / ATLAS_COLS);
    g.font = `bold ${String(n).length > 1 ? 150 : 190}px Arial, sans-serif`;
    g.fillText(String(n), col * ATLAS_TILE + ATLAS_TILE / 2, row * ATLAS_TILE + ATLAS_TILE / 2 + 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy  = 8;
  tex.needsUpdate = true;
  _atlas = tex;
  return tex;
}

function atlasRect(n: number): THREE.Vector4 {
  const col = n % ATLAS_COLS;
  const row = Math.floor(n / ATLAS_COLS);
  return new THREE.Vector4(
    col / ATLAS_COLS,
    1 - (row + 1) / ATLAS_ROWS,
    1 / ATLAS_COLS,
    1 / ATLAS_ROWS,
  );
}

// ── Number-circle axes ───────────────────────────────────────────────────────
// Solid: ±Z poles so one patch is front-facing, the other back-facing.
const SOLID_AXES: [THREE.Vector3, THREE.Vector3] = [
  new THREE.Vector3(0, 0,  1),
  new THREE.Vector3(0, 0, -1),
];
// Stripe: equatorial (Y=0 plane) so the patches land on the colored band.
const STRIPE_AXES: [THREE.Vector3, THREE.Vector3] = (() => {
  const a = new THREE.Vector3(0.6, 0.0, 0.8).normalize();
  return [a, a.clone().negate()];
})();

function numAxes(n: number): [THREE.Vector3, THREE.Vector3] {
  return isStripe(n) ? STRIPE_AXES : SOLID_AXES;
}

// ── Shader geometry parameters ────────────────────────────────────────────────
const CAP_ANGLE = THREE.MathUtils.degToRad(24); // number-circle spherical-cap half-angle
const BAND_HALF = THREE.MathUtils.degToRad(28); // stripe band half-angle around equator
const NUM_HALF  = THREE.MathUtils.degToRad(15); // gnomonic glyph half-extent

// ── GLSL snippets ─────────────────────────────────────────────────────────────
const VERT_COMMON_INSERT = `varying vec3 vObjPos;`;
const VERT_BEGIN_INSERT  = `vObjPos = position;`;

const FRAG_UNIFORMS = `
  varying vec3 vObjPos;
  uniform sampler2D uAtlas;
  uniform vec3      uColor;
  uniform int       uIsStripe;
  uniform vec3      uAxis0;
  uniform vec3      uAxis1;
  uniform float     uCapAngle;
  uniform float     uBandHalf;
  uniform float     uNumHalf;
  uniform vec4      uAtlasRect;

  // Gnomonic projection → atlas alpha for one number-circle patch.
  float glyphA(vec3 dir, vec3 axis) {
    vec3 N  = normalize(axis);
    vec3 up = abs(N.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 B  = normalize(up - N * dot(up, N));   // up-ish → glyph vertical
    vec3 T  = normalize(cross(B, N));           // horizontal → glyph U
    float dn = dot(dir, N);
    if (dn <= 0.0001) return 0.0;
    float tt = dot(dir, T) / dn;
    float bb = dot(dir, B) / dn;
    float gu = 0.5 + (tt / tan(uNumHalf)) * 0.5;
    float gv = 0.5 + (bb / tan(uNumHalf)) * 0.5;
    if (gu < 0.0 || gu > 1.0 || gv < 0.0 || gv > 1.0) return 0.0;
    vec2 auv = uAtlasRect.xy + vec2(gu, gv) * uAtlasRect.zw;
    return texture2D(uAtlas, auv).a;
  }
`;

// Injected after #include <color_fragment> — overwrites diffuseColor.rgb.
const FRAG_COLOR_INJECT = `
  {
    vec3 dir = normalize(vObjPos);
    // Base body color: white for stripes, ball color for solids.
    vec3 col = (uIsStripe == 1) ? vec3(0.988, 0.988, 0.968) : uColor;
    // Stripe band: narrow colored latitude ring around equator (large white poles).
    if (uIsStripe == 1) {
      float bandAng = acos(clamp(dir.y, -1.0, 1.0));
      float bw = fwidth(bandAng) + 1e-4;
      float inBand = 1.0 - smoothstep(uBandHalf - bw, uBandHalf + bw, abs(bandAng - 1.5707963));
      col = mix(col, uColor, inBand);
    }
    // Two number-circle patches: white disc backing + black glyph.
    for (int p = 0; p < 2; p++) {
      vec3 ax   = (p == 0) ? uAxis0 : uAxis1;
      float ang = acos(clamp(dot(dir, ax), -1.0, 1.0));
      float aw  = fwidth(ang) + 1e-4;
      float inCap = 1.0 - smoothstep(uCapAngle - aw, uCapAngle + aw, ang);
      if (inCap > 0.001) {
        col = mix(col, vec3(0.988, 0.988, 0.968), inCap);
        float ga = glyphA(dir, ax);
        col = mix(col, vec3(0.067), ga * inCap);
      }
    }
    diffuseColor.rgb = col;
  }
`;

// ── Public factory ────────────────────────────────────────────────────────────
const GLOSS_PARAMS = {
  roughness:           0.08,
  metalness:           0.0,
  clearcoat:           1.0,
  clearcoatRoughness:  0.03,
};

/**
 * Create a per-ball PBR material with SDF number/stripe shader injected.
 * Ball 0 (cue) returns plain white — no shader injection needed.
 */
export function makeBallMaterial(num: number): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, ...GLOSS_PARAMS });
  if (num === 0) return mat;

  const stripe = isStripe(num);
  const [axis0, axis1] = numAxes(num);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uAtlas']     = { value: getAtlas() };
    shader.uniforms['uColor']     = { value: new THREE.Color(WPA_COLORS[num]) };
    shader.uniforms['uIsStripe']  = { value: stripe ? 1 : 0 };
    shader.uniforms['uAxis0']     = { value: axis0.clone() };
    shader.uniforms['uAxis1']     = { value: axis1.clone() };
    shader.uniforms['uCapAngle']  = { value: CAP_ANGLE };
    shader.uniforms['uBandHalf']  = { value: BAND_HALF };
    shader.uniforms['uNumHalf']   = { value: NUM_HALF };
    shader.uniforms['uAtlasRect'] = { value: atlasRect(num) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',       `#include <common>\n${VERT_COMMON_INSERT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BEGIN_INSERT}`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',         `#include <common>\n${FRAG_UNIFORMS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR_INJECT}`);
  };
  mat.needsUpdate = true;
  return mat;
}
