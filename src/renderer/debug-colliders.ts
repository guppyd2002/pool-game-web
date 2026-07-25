/**
 * Debug overlay — draws physics collision boundaries as cyan LineSegments.
 *
 * Segment endpoints derived directly from physics/constants.ts (same values the
 * engine uses), so the lines show the exact ball-bounce boundaries.  Rendered at
 * Y = +2mm above the felt surface so they are visible without z-fighting.
 *
 * Usage: createColliderDebug() returns a THREE.Group (default visible=false).
 *        Call group.visible = !group.visible to toggle.
 *        Expose via SceneAPI.toggleColliders() or window.__poolDebug.
 */

import * as THREE from 'three';
import {
  PHYSICS_MULTIPLIER,
  RAIL_LONG_X, RAIL_BACK_X, RAIL_BACK_Z,
  RAIL_LONG_SCALE_X, RAIL_SHORT_SCALE_X,
  CORNER_A_X, CORNER_A_Z, CORNER_B_X, CORNER_B_Z,
  CORNER_A_SCALE_X, CORNER_B_SCALE_X, DIAG_UNIT,
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_SIN, SIDE_JAW_COS,
} from '../physics/constants';

const PM = PHYSICS_MULTIPLIER; // 10000 — physics unit → meter divisor

function toM(v: number): number {
  return v / PM;
}

/**
 * Return the two 2D endpoints (xz plane) of a line collider.
 * px/pz: center in physics units. rx/rz: right-vector components (× 10000). sx: scale.x.
 */
function lineEndpoints(
  px: number, pz: number, rx: number, rz: number, sx: number,
): [THREE.Vector3, THREE.Vector3] {
  const Y = 0.002;
  const half = sx / 2;
  return [
    new THREE.Vector3(toM(px + rx * half / PM), Y, toM(pz + rz * half / PM)),
    new THREE.Vector3(toM(px - rx * half / PM), Y, toM(pz - rz * half / PM)),
  ];
}

/**
 * Build the full physics collision boundary as a THREE.Group containing one
 * LineSegments mesh.  The group starts hidden (visible = false).
 * Add to scene and toggle group.visible to show/hide.
 */
export function createColliderDebug(): THREE.Group {
  const positions: number[] = [];

  function addLine(px: number, pz: number, rx: number, rz: number, sx: number): void {
    const [a, b] = lineEndpoints(px, pz, rx, rz, sx);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  const D = DIAG_UNIT;
  const SC = SIDE_JAW_SIN;
  const CC = SIDE_JAW_COS;

  // ── Long side rails (at x = ±RAIL_LONG_X, run along Z) ────────────────────
  addLine( RAIL_LONG_X, 0,  0,  PM, RAIL_LONG_SCALE_X);
  addLine(-RAIL_LONG_X, 0,  0, -PM, RAIL_LONG_SCALE_X);

  // ── End cushions (at z = ±RAIL_BACK_Z, split by side pocket, run along X) ─
  // Each side = 2 half-segments with gap at |x| ≈ RAIL_BACK_X - RAIL_SHORT_RADIUS
  addLine( RAIL_BACK_X,  RAIL_BACK_Z, -PM, 0, RAIL_SHORT_SCALE_X);  // head-right
  addLine(-RAIL_BACK_X,  RAIL_BACK_Z, -PM, 0, RAIL_SHORT_SCALE_X);  // head-left
  addLine( RAIL_BACK_X, -RAIL_BACK_Z,  PM, 0, RAIL_SHORT_SCALE_X);  // foot-right
  addLine(-RAIL_BACK_X, -RAIL_BACK_Z,  PM, 0, RAIL_SHORT_SCALE_X);  // foot-left

  // ── Corner pocket jaw cushions (±45°, 2 per corner × 4 corners = 8) ───────
  // A = arm toward long rail; B = arm toward end cushion
  addLine( CORNER_A_X,  CORNER_A_Z, -D, -D, CORNER_A_SCALE_X);  // head-right A
  addLine( CORNER_B_X,  CORNER_B_Z,  D,  D, CORNER_B_SCALE_X);  // head-right B
  addLine(-CORNER_A_X, -CORNER_A_Z,  D,  D, CORNER_A_SCALE_X);  // foot-left A
  addLine(-CORNER_B_X, -CORNER_B_Z, -D, -D, CORNER_B_SCALE_X);  // foot-left B
  addLine( CORNER_A_X, -CORNER_A_Z,  D, -D, CORNER_A_SCALE_X);  // foot-right A
  addLine( CORNER_B_X, -CORNER_B_Z, -D,  D, CORNER_B_SCALE_X);  // foot-right B
  addLine(-CORNER_A_X,  CORNER_A_Z, -D,  D, CORNER_A_SCALE_X);  // head-left A
  addLine(-CORNER_B_X,  CORNER_B_Z,  D, -D, CORNER_B_SCALE_X);  // head-left B

  // ── Side pocket jaw cushions (~10° from Z, 2 per pocket × 2 pockets = 4) ──
  addLine(-SIDE_JAW_X,  SIDE_JAW_Z, -SC, -CC, SIDE_JAW_SCALE);  // back-left
  addLine( SIDE_JAW_X,  SIDE_JAW_Z, -SC,  CC, SIDE_JAW_SCALE);  // back-right
  addLine(-SIDE_JAW_X, -SIDE_JAW_Z,  SC, -CC, SIDE_JAW_SCALE);  // front-left
  addLine( SIDE_JAW_X, -SIDE_JAW_Z,  SC,  CC, SIDE_JAW_SCALE);  // front-right

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // depthTest: false keeps lines visible above the table model
  const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false });

  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 999;

  const group = new THREE.Group();
  group.add(lines);
  group.visible = false;
  return group;
}
