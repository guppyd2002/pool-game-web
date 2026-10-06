/**
 * Phase 1 #7a A-1′ — table texture anisotropy aligned to ball atlas (min(max, 8)).
 * Top-view null result is predicted (horizontal faces); orbit benefits vertical faces.
 */
import * as THREE from 'three';
import { getBallDigitAtlas } from './ball-materials';

/** Match ball-materials.ts atlas anisotropy; never request above GPU max. */
export const TABLE_ANISOTROPY_CAP = 8;

export interface AnisotropyTextureRow {
  slot: string;
  anisotropySet: number;
  /** Effective GPU clamp: min(set, maxAnisotropy). */
  anisotropyEffective: number;
}

export interface AnisotropyReport {
  maxAnisotropy: number;
  cap: number;
  applied: boolean;
  table: AnisotropyTextureRow[];
  ball: AnisotropyTextureRow[];
}

function row(slot: string, tex: THREE.Texture | null | undefined, maxA: number): AnisotropyTextureRow | null {
  if (!tex) return null;
  const set = tex.anisotropy;
  return {
    slot,
    anisotropySet: set,
    anisotropyEffective: Math.min(set, maxA),
  };
}

/** Collect map/normalMap/metalnessMap(+roughness/ao) from a material. */
export function collectMaterialMaps(mat: THREE.Material): { slot: string; tex: THREE.Texture }[] {
  const out: { slot: string; tex: THREE.Texture }[] = [];
  const m = mat as THREE.MeshStandardMaterial;
  const pairs: [string, THREE.Texture | null | undefined][] = [
    ['map', m.map],
    ['normalMap', m.normalMap],
    ['metalnessMap', m.metalnessMap],
    ['roughnessMap', m.roughnessMap],
    ['aoMap', m.aoMap],
  ];
  const seen = new Set<THREE.Texture>();
  for (const [slot, tex] of pairs) {
    if (tex && !seen.has(tex)) {
      seen.add(tex);
      out.push({ slot, tex });
    }
  }
  return out;
}

/**
 * Apply A-1′ to all table meshes under `root`.
 * Returns unique textures touched. No-op if `apply` is false (A/B baseline).
 */
export function applyTableAnisotropy(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  apply: boolean,
): { maxAnisotropy: number; target: number; textures: THREE.Texture[] } {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const target = Math.min(maxAnisotropy, TABLE_ANISOTROPY_CAP);
  const seen = new Set<THREE.Texture>();
  const textures: THREE.Texture[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const { tex } of collectMaterialMaps(mat)) {
        if (seen.has(tex)) continue;
        seen.add(tex);
        textures.push(tex);
        if (apply) {
          tex.anisotropy = target;
          tex.needsUpdate = true;
        }
      }
    }
  });

  return { maxAnisotropy, target, textures };
}

/** Build probe/debug report for table + ball materials. */
export function buildAnisotropyReport(
  renderer: THREE.WebGLRenderer,
  tableRoot: THREE.Object3D,
  balls: THREE.Mesh[],
  applied: boolean,
): AnisotropyReport {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const table: AnisotropyTextureRow[] = [];
  const seenT = new Set<THREE.Texture>();
  tableRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const { slot, tex } of collectMaterialMaps(mat)) {
        if (seenT.has(tex)) continue;
        seenT.add(tex);
        const r = row(`table.${slot}`, tex, maxAnisotropy);
        if (r) table.push(r);
      }
    }
  });

  const ball: AnisotropyTextureRow[] = [];
  const seenB = new Set<THREE.Texture>();
  // Digit atlas is a shader uniform (uAtlas), not material.map — report explicitly.
  const atlas = getBallDigitAtlas();
  if (atlas) {
    seenB.add(atlas);
    const r = row('ball.digitAtlas(uAtlas)', atlas, maxAnisotropy);
    if (r) ball.push(r);
  }
  for (const mesh of balls) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const { slot, tex } of collectMaterialMaps(mat)) {
        if (seenB.has(tex)) continue;
        seenB.add(tex);
        const r = row(`ball.${slot}`, tex, maxAnisotropy);
        if (r) ball.push(r);
      }
    }
  }

  return { maxAnisotropy, cap: TABLE_ANISOTROPY_CAP, applied, table, ball };
}
