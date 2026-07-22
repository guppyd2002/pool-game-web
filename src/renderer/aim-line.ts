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
// Uses Line2 (fat-line addon) so linewidth > 1 works on WebGL (standard
// THREE.LineBasicMaterial ignores linewidth due to the WebGL spec limit of 1px).

import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Aim line width in CSS pixels (applies on all WebGL devices including mobile). */
const AIM_LINE_WIDTH = 2.5;

export interface AimLineVisual {
  /** Refresh the line from current CueController state. Pass null to hide. */
  update(cueBallPos: CmVector, hit: AimHit | null): void;
  dispose(): void;
}

export function createAimLine(scene: THREE.Scene): AimLineVisual {
  const mat = new LineMaterial({
    color: 0xffffff,
    opacity: 0.75,
    transparent: true,
    linewidth: AIM_LINE_WIDTH,
    // resolution must match the renderer pixel size for correct width
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  const geo = new LineGeometry();
  // LineGeometry requires at least 2 points; initialise with a degenerate pair.
  geo.setPositions([0, 0, 0, 0, 0, 0]);

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.visible = false;
  scene.add(line);

  // Keep LineMaterial resolution in sync so line width stays physically correct.
  function _onResize(): void {
    mat.resolution.set(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', _onResize);

  return {
    update(cueBallPos: CmVector, hit: AimHit | null): void {
      const pts = hit ? computeAimLinePoints(cueBallPos, hit) : [];
      if (pts.length < 2) {
        line.visible = false;
        return;
      }
      // LineGeometry.setPositions expects a flat [x,y,z, x,y,z, …] array.
      geo.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
      line.computeLineDistances();
      line.visible = true;
    },

    dispose(): void {
      window.removeEventListener('resize', _onResize);
      scene.remove(line);
      geo.dispose();
      mat.dispose();
    },
  };
}
