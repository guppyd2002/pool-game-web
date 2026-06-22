/**
 * Pool table setup — creates CmSpace with table geometry, balls, cushions, pockets.
 * Coordinates: x = table long axis, z = short axis, y = up.
 * All values in fixed-point (MULTIPLIER = 10000, so 1.0 = 10000).
 *
 * Collider inventory (19 total) sourced from _Game/Scenes/Game.unity (47170 lines):
 *   1  cloth plane
 *   2  long side rails (x=±12699)
 *   4  end cushions (z=±6349, split into ±x halves by side pocket gap at x≈0)
 *   8  corner jaw cushions (2 per corner × 4 corners, ±45°)
 *   4  side pocket jaw cushions (2 per side pocket × 2 side pockets, ≈±10°)
 *
 * All physics constants imported from physics/constants.ts (single source of truth).
 */

import { CmVector } from '../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../physics/colliders';
import type { CmMaterial } from '../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../physics/cm-rigidbody';
import { CmSpace } from '../physics/cm-space';
import type { CmSpaceCube } from '../physics/cm-collision';
import {
  BALL_MASS, BALL_RADIUS,
  TABLE_Y, BALL_Y,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z, SPACE_POS_Y,
  RAIL_LONG_X, RAIL_BACK_X, RAIL_BACK_Z,
  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_B_X, CORNER_B_Z,
  CORNER_A_SCALE_X, CORNER_A_RADIUS, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, SIDE_JAW_SIN, SIDE_JAW_COS,
  POCKET_RADIUS, POCKET_POSITIONS,
  BALL_MATERIAL, CLOTH_MATERIAL, RAIL_MATERIAL,
} from '../physics/constants';
import { getAllRackPositions } from './rack-positions';

// ─── Ball factory ─────────────────────────────────────────────────────────────

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id       = id;
  col.position = new CmVector(x, y, z);
  col.right    = new CmVector(10000, 0, 0);
  col.up       = new CmVector(0, 10000, 0);
  col.forward  = new CmVector(0, 0, 10000);
  col.scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius   = BALL_RADIUS;
  col.material = { ...BALL_MATERIAL };
  const body = new CmRigidbody();
  body.id   = id;
  body.mass = BALL_MASS;
  body.collider = col;
  return body;
}

// ─── Rail factory ─────────────────────────────────────────────────────────────

function makeLine(
  id: number, px: number, py: number, pz: number,
  rx: number, ry: number, rz: number,
  ux: number, uy: number, uz: number,
  fx: number, fy: number, fz: number,
  scaleX: number, radius: number, mat: CmMaterial,
): CmLineCollider {
  const c = new CmLineCollider();
  c.id       = id;
  c.position = new CmVector(px, py, pz);
  c.right    = new CmVector(rx, ry, rz);
  c.up       = new CmVector(ux, uy, uz);
  c.forward  = new CmVector(fx, fy, fz);
  c.scale    = new CmVector(scaleX, 5000, 5000);
  c.radius   = radius;
  c.material = { ...mat };
  return c;
}

/** Create the full pool table physics scene (16 balls in standard 8-ball rack) */
export function createPoolTable(): CmSpace {
  // spaceCube: Unity true scale=(40000,30000,30000), pos=(0,5000,0) @ Game.unity:25395
  const spaceCube: CmSpaceCube = {
    position: new CmVector(0, SPACE_POS_Y, 0),
    scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
  };

  // ─── Balls: GAME-010 C# delta array positions ─────────────────────
  // getAllRackPositions() is the single source of truth for rack layout;
  // physics initial state and visual reset (_placeRack in game-session) both use it.
  const bodies: CmRigidbody[] = [];
  const rackPositions = getAllRackPositions();
  for (let id = 0; id < 16; id++) {
    const { x, z } = rackPositions[id];
    bodies.push(makeBall(id, x, BALL_Y, z));
  }

  // ─── Table geometry ─────────────────────────────────────────────────
  const colliders: (CmPlaneCollider | CmLineCollider)[] = [];
  let cid = 0;

  // Table cloth (plane at TABLE_Y)
  const plane = new CmPlaneCollider();
  plane.id       = cid++;
  plane.position = new CmVector(0, TABLE_Y, 0);
  plane.right    = new CmVector(10000, 0, 0);
  plane.up       = new CmVector(0, 10000, 0);
  plane.forward  = new CmVector(0, 0, 10000);
  plane.scale    = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS);
  plane.radius   = PLANE_RADIUS;
  plane.material = { ...CLOTH_MATERIAL };
  colliders.push(plane);

  // Long side rails (x = ±RAIL_LONG_X): LineCollider 4 (+x) and 5 (-x)
  colliders.push(makeLine(cid++,  RAIL_LONG_X, BALL_Y, 0,   0,0,10000,  0,10000,0, -10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -RAIL_LONG_X, BALL_Y, 0,   0,0,-10000, 0,10000,0,  10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MATERIAL));

  // End cushions (z = ±RAIL_BACK_Z, split at x≈0 by side pocket gap ~1228 units wide):
  // Each long end has 2 half-segments, for 4 total. LineColliders 0-3 in Game.unity.
  colliders.push(makeLine(cid++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL)); // head right (LineCollider 2)
  colliders.push(makeLine(cid++, -RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL)); // head left  (LineCollider 3) ← was missing
  colliders.push(makeLine(cid++,  RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL)); // foot right (LineCollider 1) ← was missing
  colliders.push(makeLine(cid++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL)); // foot left  (LineCollider 0)

  // Corner pocket jaw cushions (±45°) — 2 per corner × 4 corners = 8 total.
  // A = arm along z-axis (farther from long rail); B = arm along x-axis (closer to long rail).
  // Head-right corner (+x,+z): LineColliderPocket 4+5
  colliders.push(makeLine(cid++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));
  // Foot-left corner (-x,-z): LineColliderPocket 2+3
  colliders.push(makeLine(cid++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));
  // Foot-right corner (+x,-z): LineColliderPocket 0+1 ← was missing
  colliders.push(makeLine(cid++,  CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++,  CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));
  // Head-left corner (-x,+z): LineColliderPocket 6+7 ← was missing
  colliders.push(makeLine(cid++, -CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));

  // Side pocket jaw cushions (~10°) — 2 per side pocket × 2 side pockets = 4 total.
  // LineColliderPocket 8-11 in Game.unity; SIDE_JAW_SIN=sin(10°)×10k, SIDE_JAW_COS=cos(10°)×10k.
  colliders.push(makeLine(cid++, -SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MATERIAL)); // back-left  (pocket 8)
  colliders.push(makeLine(cid++,  SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MATERIAL)); // back-right (pocket 9)
  colliders.push(makeLine(cid++, -SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MATERIAL)); // front-left (pocket 10)
  colliders.push(makeLine(cid++,  SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MATERIAL)); // front-right (pocket 11)

  // ─── Pocket triggers ────────────────────────────────────────────────
  const triggers: CmKinematicTrigger[] = POCKET_POSITIONS.map(([px, pz], i) => {
    const t = new CmKinematicTrigger();
    t.id       = i;
    t.position = new CmVector(px, BALL_Y, pz);
    t.radius   = POCKET_RADIUS;
    return t;
  });

  // ─── Create space ───────────────────────────────────────────────────
  const space = new CmSpace();
  space.init(spaceCube, bodies, colliders, triggers);

  // Balls start inactive — activated by first shot
  for (const body of space.rigidbodies) {
    body.isActive = false;
  }

  return space;
}
