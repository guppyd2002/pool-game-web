/**
 * B1 structural guard — max-force break must NOT tunnel balls through rails or table.
 *
 * The B1 bug (MAX_FORCE=65000):
 *   v_max per adaptive timestep (MIN_TS=50) ≫ rail half-width (285 units).
 *   Ball teleports past rail surface in one step → collision detection misses it →
 *   ball exits table through wall geometry rather than bouncing off it.
 *
 * After fix (MAX_FORCE=9100):
 *   Per-step displacement at max velocity is ~267 units (< BALL_RADIUS=285).
 *   Collision detection catches every cushion contact; no tunneling.
 *   Some balls may still legitimately escape over the edge in a hard break —
 *   that is expected billiards physics, not a bug.
 *
 * Guard assertions:
 *   A) No ball that remains in the simulation space (not isOutOfCube) goes below TABLE_Y.
 *      Balls below the table surface while still "inside" would indicate a floor tunnel.
 *   B) At most 6 of 16 balls escape (isOutOfCube) at MAX_FORCE.
 *      At 65000, nearly all balls tunnel → ≥ 10 escape.
 *
 * Discriminant: same test with impulse=65000 must violate both B's upper bound (≥ 7 escape).
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
  POCKET_RADIUS, POCKET_POSITIONS,
} from '../../physics/constants';
import { getAllRackPositions } from '../../game/rack-positions';

// ─── Scene builders (same as golden-vector.test.ts) ──────────────────────────

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
 * Build a full table CmSpace with all 16 balls in rack positions.
 * Applies the given impulse to the cue ball (id=0) along +x (toward rack) before returning.
 */
function makeBreakSpace(impulseX: number): CmSpace {
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

  const colliders = [
    plane,
    makeLine(cid++,  RAIL_LONG_X, BALL_Y, 0,  0,0,10000, 0,10000,0, -10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT),
    makeLine(cid++, -RAIL_LONG_X, BALL_Y, 0,  0,0,-10000, 0,10000,0, 10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT),
    makeLine(cid++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT),
    makeLine(cid++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT),
    makeLine(cid++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT),
    makeLine(cid++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT),
    makeLine(cid++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT),
    makeLine(cid++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT),
  ];

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

describe('B1 structural guard — max-force break', () => {

  it('MAX_FORCE (9100) break: no in-table ball sinks below TABLE_Y (no floor tunneling)', () => {
    // Balls that legitimately escape (isOutOfCube=true) may fall below TABLE_Y in free-fall.
    // Only balls still within the simulation space must stay above the table surface.
    const space = makeBreakSpace(MAX_FORCE);
    simulateToCompletion(space);
    const sunk = space.rigidbodies.filter(
      b => !b.isOutOfCube && !b.isKinematic && b.collider.position.y < TABLE_Y,
    );
    expect(sunk.map(b => b.id)).toEqual([]);
  });

  it('MAX_FORCE (9100) break: at most 6 of 16 balls escape (excessive escape = tunneling)', () => {
    // A hard break at true MAX_FORCE may send a few balls over the edge (expected physics).
    // With pre-fix impulse=65000, virtually all balls tunnel → ≥ 10 escape.
    // The threshold 6 is derived from C# golden output: GV-14 at 85% shows 2 escapes; 100% shows 5.
    const space = makeBreakSpace(MAX_FORCE);
    simulateToCompletion(space);
    const escaped = space.rigidbodies.filter(b => b.isOutOfCube);
    expect(escaped.length).toBeLessThanOrEqual(6);
  });

  it('DISCRIMINANT: impulse=65000 (pre-fix) causes mass-escape ≥ 7 — guard is effective', () => {
    // Proves the threshold (≤ 6) has real discrimination power.
    // At 65000, per-step velocity is ~670× rail thickness → collision detection misses rails →
    // nearly all balls tunnel out of the space cube.
    const space = makeBreakSpace(65000);
    simulateToCompletion(space);
    const escaped = space.rigidbodies.filter(b => b.isOutOfCube);
    expect(escaped.length).toBeGreaterThanOrEqual(7);
  });

});
