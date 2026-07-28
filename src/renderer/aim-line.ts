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
import { ghostCenter } from './ghost-ball';

/** Convert a Fixed-point CmVector to a Three.js world-space Vector3. */
export function toWorld(v: CmVector): THREE.Vector3 {
  return new THREE.Vector3(v.x / MULTIPLIER, v.y / MULTIPLIER, v.z / MULTIPLIER);
}

/**
 * Compute the polyline points for the aim line (Unity base line).
 *
 * Returns:
 *   'none'             → [cueBallPos, hitPoint]
 *   'ball'             → [cueBallPos, ghostCenter]  (母球→ghost 前緣, not contact point)
 *   'cushion' (normal) → [cueBallPos, hitPoint, bounce]
 *
 * Bounce length default = Unity lineDistance 0.25 (was 0.5 — SP-Harden-5).
 * Ball branch ends at ghost so base line meets the separation T at ghost center.
 */
export function computeAimLinePoints(
  cueBallPos: CmVector,
  hit: AimHit,
  bounceLength = 0.25,
): THREE.Vector3[] {
  const from = toWorld(cueBallPos);

  // Ball hit: base line ends at ghost center (Point + Normal*R), not contact point.
  if (hit.hitType === 'ball') {
    const g = ghostCenter(hit);
    return [from, new THREE.Vector3(g.x, g.y, g.z)];
  }

  const to = toWorld(hit.point);

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

/** Unity legal white / illegal red for base aim line (SP-Harden-5). */
const AIM_COLOR_LEGAL   = 0xffffff;
const AIM_COLOR_ILLEGAL = 0xff3333;

export interface AimLineVisual {
  /**
   * Refresh the line from current CueController state. Pass null to hide.
   * isLegal=false paints red (illegal first-ball target).
   */
  update(cueBallPos: CmVector, hit: AimHit | null, isLegal?: boolean): void;
  dispose(): void;
}

export function createAimLine(scene: THREE.Scene): AimLineVisual {
  const mat = new LineMaterial({
    color: AIM_COLOR_LEGAL,
    opacity: 0.85,
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
    update(cueBallPos: CmVector, hit: AimHit | null, isLegal = true): void {
      const pts = hit ? computeAimLinePoints(cueBallPos, hit) : [];
      if (pts.length < 2) {
        line.visible = false;
        return;
      }
      mat.color.setHex(isLegal ? AIM_COLOR_LEGAL : AIM_COLOR_ILLEGAL);
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
