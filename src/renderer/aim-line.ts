/**
 * P1-T02: AimLine — visualises the predictAimLine result in Three.js.
 *
 * Pure functions (testable in Node):
 *   toWorld(v)             — CmVector Fixed → THREE.Vector3 float
 *   computeAimLinePoints() — CmVector + AimHit → polyline points
 *
 * Three.js wrapper (browser only):
 *   createAimLine(scene)   — creates/updates/disposes the THREE.Line object
 */

import * as THREE from 'three';
import { MULTIPLIER } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import type { AimHit } from '../game/ball-pool-physics';

/** Convert a Fixed-point CmVector to a Three.js world-space Vector3. */
export function toWorld(v: CmVector): THREE.Vector3 {
  return new THREE.Vector3(v.x / MULTIPLIER, v.y / MULTIPLIER, v.z / MULTIPLIER);
}

/**
 * Compute the polyline points for the aim line.
 *
 * Returns:
 *   'none' / 'ball'    → [cueBallPos, hitPoint]        (straight line)
 *   'cushion' (normal) → [cueBallPos, hitPoint, bounce] (bounce line appended)
 *
 * The bounce line uses optical reflection: r = d - 2·(d·n)·n.
 */
export function computeAimLinePoints(
  cueBallPos: CmVector,
  hit: AimHit,
  bounceLength = 0.5,
): THREE.Vector3[] {
  const from = toWorld(cueBallPos);
  const to   = toWorld(hit.point);

  if (hit.hitType === 'cushion') {
    const norm = toWorld(hit.normal).normalize();
    if (norm.lengthSq() > 0) {
      const inc = to.clone().sub(from).normalize();
      const ref = inc.reflect(norm);
      return [from, to, to.clone().add(ref.multiplyScalar(bounceLength))];
    }
  }

  return [from, to];
}

// ─── Three.js wrapper (browser) ───────────────────────────────────────────────

export interface AimLineVisual {
  /** Refresh the line from current CueController state. Pass null to hide. */
  update(cueBallPos: CmVector, hit: AimHit | null): void;
  dispose(): void;
}

export function createAimLine(scene: THREE.Scene): AimLineVisual {
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
  const geo = new THREE.BufferGeometry();
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  return {
    update(cueBallPos: CmVector, hit: AimHit | null): void {
      if (!hit) {
        geo.setFromPoints([]);
        return;
      }
      geo.setFromPoints(computeAimLinePoints(cueBallPos, hit));
    },

    dispose(): void {
      scene.remove(line);
      geo.dispose();
      mat.dispose();
    },
  };
}
