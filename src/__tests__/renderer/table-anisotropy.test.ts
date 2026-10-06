/**
 * Phase 1 #7a A-1′ — table anisotropy helpers (no real WebGL).
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  TABLE_ANISOTROPY_CAP,
  applyTableAnisotropy,
  buildAnisotropyReport,
} from '../../renderer/table-anisotropy';

function fakeRenderer(maxAnisotropy: number): THREE.WebGLRenderer {
  return {
    capabilities: { getMaxAnisotropy: () => maxAnisotropy },
  } as unknown as THREE.WebGLRenderer;
}

describe('table-anisotropy A-1′', () => {
  it('caps at min(maxAnisotropy, 8) and sets needsUpdate', () => {
    const renderer = fakeRenderer(16);
    const map = new THREE.Texture();
    const normalMap = new THREE.Texture();
    const metalnessMap = new THREE.Texture();
    map.anisotropy = 1;
    normalMap.anisotropy = 1;
    metalnessMap.anisotropy = 1;

    const mat = new THREE.MeshStandardMaterial({ map, normalMap, metalnessMap });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    const root = new THREE.Group();
    root.add(mesh);

    const { target, textures, maxAnisotropy } = applyTableAnisotropy(renderer, root, true);
    expect(maxAnisotropy).toBe(16);
    expect(target).toBe(TABLE_ANISOTROPY_CAP);
    expect(textures.length).toBe(3);
    for (const t of textures) {
      expect(t.anisotropy).toBe(8);
    }

    const report = buildAnisotropyReport(renderer, root, [], true);
    expect(report.maxAnisotropy).toBe(16);
    expect(report.applied).toBe(true);
    expect(report.table.length).toBe(3);
    expect(report.table.every((r) => r.anisotropyEffective === 8)).toBe(true);
  });

  it('respects GPU max when max < 8', () => {
    const renderer = fakeRenderer(4);
    const map = new THREE.Texture();
    map.anisotropy = 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ map }),
    );
    const { target } = applyTableAnisotropy(renderer, mesh, true);
    expect(target).toBe(4);
    expect(map.anisotropy).toBe(4);
  });

  it('apply=false leaves anisotropy unchanged (A/B baseline)', () => {
    const renderer = fakeRenderer(16);
    const map = new THREE.Texture();
    map.anisotropy = 1;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ map }),
    );
    applyTableAnisotropy(renderer, mesh, false);
    expect(map.anisotropy).toBe(1);
  });
});
