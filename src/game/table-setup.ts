/**
 * Pool table setup — creates CmSpace with table geometry, balls, cushions, pockets.
 * Coordinates: x = table long axis, z = short axis, y = up.
 * All values in fixed-point (MULTIPLIER = 10000, so 1.0 = 10000).
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
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  RAIL_LONG_X, RAIL_BACK_X, RAIL_BACK_Z,
  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_B_X, CORNER_B_Z,
  CORNER_A_SCALE_X, CORNER_A_RADIUS, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  POCKET_RADIUS, POCKET_POSITIONS,
  BALL_MATERIAL, CLOTH_MATERIAL, RAIL_MATERIAL,
} from '../physics/constants';

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
  const spaceCube: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
  };

  // ─── Balls ─────────────────────────────────────────────────────────
  const bodies: CmRigidbody[] = [];
  const spacing = BALL_RADIUS * 2 + 5;
  const cueBallX = -Math.trunc(RAIL_LONG_X / 2);

  // Cue ball (id=0)
  bodies.push(makeBall(0, cueBallX, BALL_Y, 0));

  // Triangle rack at +x (ids 1-15)
  const rackX = Math.trunc(RAIL_LONG_X / 2);
  const rowDx = Math.trunc(spacing * 866 / 1000);
  let id = 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = rackX + row * rowDx;
      const z = (col * 2 - row) * Math.trunc(spacing / 2);
      bodies.push(makeBall(id++, x, BALL_Y, z));
    }
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

  // Long rails (x = ±RAIL_LONG_X)
  colliders.push(makeLine(cid++,  RAIL_LONG_X, BALL_Y, 0,   0,0,10000, 0,10000,0, -10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -RAIL_LONG_X, BALL_Y, 0,   0,0,-10000, 0,10000,0, 10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MATERIAL));

  // Short rails (z = ±RAIL_BACK_Z)
  colliders.push(makeLine(cid++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MATERIAL));

  // Corner pocket jaw cushions (angled ±45°)
  colliders.push(makeLine(cid++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MATERIAL));
  colliders.push(makeLine(cid++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MATERIAL));

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
