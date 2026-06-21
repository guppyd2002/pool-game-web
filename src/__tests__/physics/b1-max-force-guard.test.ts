/**
 * B1 structural guard — complete table geometry seals all ball escapes.
 *
 * Root cause (identified by 卡卡西, second QA round):
 *   The TS port was missing 2 of 4 end cushion segments AND 8 of 12 jaw cushions.
 *   Balls escaped through the open gaps in table geometry — NOT because of excessive force.
 *   卡卡西 experiment: add the 2 missing end segments → ALL force levels (9100~65000) give 0 escapes.
 *
 * After geometry fix (19 colliders total):
 *   1 cloth plane + 2 long rails + 4 end cushions + 8 corner jaws + 4 side jaws.
 *   With complete geometry, no ball escapes at any force level up to MAX_FORCE=13000.
 *
 * Guard assertions:
 *   A) No ball is isOutOfCube after MAX_FORCE break (0 escapes required, not just "≤6").
 *   B) No ball goes below TABLE_Y (no floor tunneling regardless of escape status).
 *
 * Discriminant (GEOMETRY axis — not force axis):
 *   Remove one end cushion segment → at least 1 ball must escape (isOutOfCube=true).
 *   This proves the geometry is load-bearing, not force capping.
 */

import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmForceMode, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { simulateToCompletion } from '../../physics/simulate';
import {
  MAX_FORCE, BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL as BALL_MAT, CLOTH_MATERIAL as CLOTH_MAT, RAIL_MATERIAL as RAIL_MAT,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_BACK_X, RAIL_BACK_Z, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_A_SCALE_X, CORNER_A_RADIUS,
  CORNER_B_X, CORNER_B_Z, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, SIDE_JAW_SIN, SIDE_JAW_COS,
  POCKET_RADIUS, POCKET_POSITIONS,
} from '../../physics/constants';
import { getAllRackPositions } from '../../game/rack-positions';

// ─── Scene builders ──────────────────────────────────────────────────────────

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id;
  col.position = new CmVector(x, y, z);
  col.right    = new CmVector(10000, 0, 0);
  col.up       = new CmVector(0, 10000, 0);
  col.forward  = new CmVector(0, 0, 10000);
  col.scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius   = BALL_RADIUS;
  col.material = { ...BALL_MAT };
  const b = new CmRigidbody();
  b.id = id; b.mass = BALL_MASS; b.collider = col;
  return b;
}

function makeLine(
  id: number,
  px: number, py: number, pz: number,
  rx: number, ry: number, rz: number,
  ux: number, uy: number, uz: number,
  fx: number, fy: number, fz: number,
  scaleX: number, radius: number, mat: CmMaterial,
): CmLineCollider {
  const c = new CmLineCollider();
  c.id = id;
  c.position = new CmVector(px, py, pz);
  c.right    = new CmVector(rx, ry, rz);
  c.up       = new CmVector(ux, uy, uz);
  c.forward  = new CmVector(fx, fy, fz);
  c.scale    = new CmVector(scaleX, 5000, 5000);
  c.radius   = radius;
  c.material = { ...mat };
  return c;
}

/**
 * Build the full 19-collider table + 16-ball rack, then apply impulseX to cue ball.
 * @param omitFootRightEndCushion - set true for discriminant test: removes foot-right end cushion,
 *   leaving a ~25398-unit open gap at z=-6349, x>0 through which balls can escape.
 */
function makeBreakSpace(impulseX: number, omitFootRightEndCushion = false): CmSpace {
  const spaceCube: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
  };

  const rackPositions = getAllRackPositions();
  const bodies: CmRigidbody[] = [];
  for (let id = 0; id < 16; id++) {
    const { x, z } = rackPositions[id];
    bodies.push(makeBall(id, x, BALL_Y, z));
  }

  let cid = 0;
  const plane = new CmPlaneCollider();
  plane.id = cid++; plane.position = new CmVector(0, TABLE_Y, 0);
  plane.right = new CmVector(10000, 0, 0); plane.up = new CmVector(0, 10000, 0);
  plane.forward = new CmVector(0, 0, 10000);
  plane.scale = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS);
  plane.radius = PLANE_RADIUS; plane.material = { ...CLOTH_MAT };

  const colliders: (CmPlaneCollider | CmLineCollider)[] = [];
  colliders.push(plane);
  // Long side rails
  colliders.push(makeLine(cid++,  RAIL_LONG_X, BALL_Y, 0,   0,0,10000,  0,10000,0, -10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -RAIL_LONG_X, BALL_Y, 0,   0,0,-10000, 0,10000,0,  10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  // End cushions (4 half-segments at z=±RAIL_BACK_Z, split by side pocket gap at x≈0)
  colliders.push(makeLine(cid++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT)); // head right
  colliders.push(makeLine(cid++, -RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT)); // head left
  if (!omitFootRightEndCushion) {
    colliders.push(makeLine(cid++,  RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT)); // foot right
  }
  colliders.push(makeLine(cid++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT)); // foot left
  // Corner jaw cushions (8 total: 2 per corner × 4 corners)
  colliders.push(makeLine(cid++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++,  CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++,  CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  // Side pocket jaw cushions (4 total: 2 per side pocket × 2 side pockets)
  colliders.push(makeLine(cid++, -SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++,  SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++, -SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  colliders.push(makeLine(cid++,  SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));

  const triggers: CmKinematicTrigger[] = POCKET_POSITIONS.map(([px, pz], i) => {
    const t = new CmKinematicTrigger();
    t.id = i; t.position = new CmVector(px, BALL_Y, pz); t.radius = POCKET_RADIUS;
    return t;
  });

  const space = new CmSpace();
  space.init(spaceCube, bodies, colliders, triggers);

  space.rigidbodies[0].addImpulse(
    new CmVector(impulseX, 0, 0),
    space.rigidbodies[0].collider.position,
    CmForceMode.Impulse,
  );

  return space;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('B1 structural guard — geometry seals table (complete collider set)', () => {

  it('MAX_FORCE (13000) break: 0 balls escape (isOutOfCube=false for all 16)', () => {
    // With complete geometry, no ball can exit the space cube at any valid force.
    // Pre-fix: 2 missing end cushion segments left open quadrants → balls flew out.
    const space = makeBreakSpace(MAX_FORCE);
    simulateToCompletion(space);
    const escaped = space.rigidbodies.filter(b => b.isOutOfCube);
    expect(escaped.map(b => b.id)).toEqual([]);
  });

  it('MAX_FORCE (13000) break: no ball below TABLE_Y (no floor tunneling)', () => {
    // All 16 balls (including kinematic/pocketed ones) must remain at or above TABLE_Y.
    const space = makeBreakSpace(MAX_FORCE);
    simulateToCompletion(space);
    const sunk = space.rigidbodies.filter(b => b.collider.position.y < TABLE_Y);
    expect(sunk.map(b => b.id)).toEqual([]);
  });

  it('DISCRIMINANT: remove foot-right end cushion → at least 1 ball escapes (geometry is load-bearing)', () => {
    // Removes the end cushion at z=-6349, x>0, exposing a gap in the z=-6349 wall.
    // With correct geometry present, 0 balls escape; without it, balls fly through the gap.
    // This test uses the GEOMETRY axis as discriminant, not the force axis.
    const space = makeBreakSpace(MAX_FORCE, /* omitFootRightEndCushion = */ true);
    simulateToCompletion(space);
    const escaped = space.rigidbodies.filter(b => b.isOutOfCube);
    expect(escaped.length).toBeGreaterThanOrEqual(1);
  });

});
