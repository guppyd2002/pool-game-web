/**
 * Structural parity-lock: shipped createPoolTable().colliders == authoritative 19-collider table.
 *
 * Mirrors rack-parity-lock.test.ts — same rationale, same gap it closes:
 *   Before B1 fix, production table had 9 colliders and GV tests had their own inline
 *   makeTable() — both were internally green but NOTHING asserted they were the same table.
 *   Balls escaped through geometry gaps that no test could see because the drift was silent.
 *
 * This test binds "the table we ship" to "the table we prove byte-equal vs C#".
 * If anyone adds, removes, or repositions a collider in table-setup.ts, this turns RED.
 *
 * Discriminant (千手 spec):
 *   Dropping foot-right end cushion (index 5) → length 18 ≠ 19 → RED.
 *   Shifting any jaw position by even 1 fixed unit → position check → RED.
 *   Both are verified by the explicit golden list + count assertion below.
 */

import { describe, it, expect } from 'vitest';
import {
  TABLE_Y, BALL_Y,
  RAIL_LONG_X,
  RAIL_BACK_X, RAIL_BACK_Z,
  CORNER_A_X, CORNER_A_Z,
  CORNER_B_X, CORNER_B_Z,
  SIDE_JAW_X, SIDE_JAW_Z,
} from '../../physics/constants';
import { createPoolTable } from '../../game/table-setup';

// Golden positions: 19 entries matching C# MakeTable() and table-setup.ts exactly.
// Index order matches cid++ counter in createPoolTable():
//   0  cloth plane
//   1-2  long side rails
//   3-6  end cushion half-segments (head-right, head-left, foot-right, foot-left)
//   7-14 corner jaw cushions (head-right A/B, foot-left A/B, foot-right A/B, head-left A/B)
//   15-18 side pocket jaw cushions (back-left, back-right, front-left, front-right)
const GOLDEN: { x: number; y: number; z: number }[] = [
  { x: 0,            y: TABLE_Y, z: 0 },            // [0]  cloth plane
  { x:  RAIL_LONG_X, y: BALL_Y,  z: 0 },            // [1]  long rail +x
  { x: -RAIL_LONG_X, y: BALL_Y,  z: 0 },            // [2]  long rail -x
  { x:  RAIL_BACK_X, y: BALL_Y,  z:  RAIL_BACK_Z }, // [3]  end head-right (+x,+z)
  { x: -RAIL_BACK_X, y: BALL_Y,  z:  RAIL_BACK_Z }, // [4]  end head-left  (-x,+z)
  { x:  RAIL_BACK_X, y: BALL_Y,  z: -RAIL_BACK_Z }, // [5]  end foot-right (+x,-z) ← B1 regressor
  { x: -RAIL_BACK_X, y: BALL_Y,  z: -RAIL_BACK_Z }, // [6]  end foot-left  (-x,-z)
  { x:  CORNER_A_X,  y: BALL_Y,  z:  CORNER_A_Z },  // [7]  head-right jaw A
  { x:  CORNER_B_X,  y: BALL_Y,  z:  CORNER_B_Z },  // [8]  head-right jaw B
  { x: -CORNER_A_X,  y: BALL_Y,  z: -CORNER_A_Z },  // [9]  foot-left  jaw A
  { x: -CORNER_B_X,  y: BALL_Y,  z: -CORNER_B_Z },  // [10] foot-left  jaw B
  { x:  CORNER_A_X,  y: BALL_Y,  z: -CORNER_A_Z },  // [11] foot-right jaw A ← was missing pre-B1
  { x:  CORNER_B_X,  y: BALL_Y,  z: -CORNER_B_Z },  // [12] foot-right jaw B ← was missing pre-B1
  { x: -CORNER_A_X,  y: BALL_Y,  z:  CORNER_A_Z },  // [13] head-left  jaw A ← was missing pre-B1
  { x: -CORNER_B_X,  y: BALL_Y,  z:  CORNER_B_Z },  // [14] head-left  jaw B ← was missing pre-B1
  { x: -SIDE_JAW_X,  y: BALL_Y,  z:  SIDE_JAW_Z },  // [15] side jaw back-left
  { x:  SIDE_JAW_X,  y: BALL_Y,  z:  SIDE_JAW_Z },  // [16] side jaw back-right
  { x: -SIDE_JAW_X,  y: BALL_Y,  z: -SIDE_JAW_Z },  // [17] side jaw front-left
  { x:  SIDE_JAW_X,  y: BALL_Y,  z: -SIDE_JAW_Z },  // [18] side jaw front-right
];

describe('table-collider parity-lock — createPoolTable() == authoritative 19-collider geometry', () => {

  it('collider count == 19 (1 plane + 2 long rail + 4 end + 8 corner jaw + 4 side jaw)', () => {
    // DISCRIMINANT: dropping any collider (e.g. foot-right end cushion) → 18 ≠ 19 → RED.
    // Pre-B1 table had 9 colliders — this catches that entire class of regression.
    const space = createPoolTable();
    expect(space.colliders).toHaveLength(19);
  });

  it('each collider position is bit-exact to golden (count + position = complete parity lock)', () => {
    // DISCRIMINANT: shifting any position by even 1 fixed unit → specific assertion → RED.
    // Covers: wrong constant, wrong sign, wrong axis, copy-paste error in table-setup.ts.
    const space = createPoolTable();
    for (let i = 0; i < GOLDEN.length; i++) {
      const g = GOLDEN[i];
      const c = space.colliders[i];
      expect(c.position.x, `collider[${i}].x`).toBe(g.x);
      expect(c.position.y, `collider[${i}].y`).toBe(g.y);
      expect(c.position.z, `collider[${i}].z`).toBe(g.z);
    }
  });

  it('foot-right end cushion (index 5) is at (+RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z)', () => {
    // Named check for the exact B1 regressor: this collider was absent pre-fix.
    // If it disappears again, the count test catches it; if its position drifts, this catches it.
    const space = createPoolTable();
    expect(space.colliders[5].position.x).toBe(RAIL_BACK_X);
    expect(space.colliders[5].position.y).toBe(BALL_Y);
    expect(space.colliders[5].position.z).toBe(-RAIL_BACK_Z);
  });

  it('all 4 previously-missing jaw cushions (indices 11-14) are present with correct positions', () => {
    // Locks the 4 jaw cushions that were absent in pre-B1 table (foot-right + head-left corners).
    const space = createPoolTable();
    // foot-right jaw A (index 11)
    expect(space.colliders[11].position.x).toBe(CORNER_A_X);
    expect(space.colliders[11].position.z).toBe(-CORNER_A_Z);
    // foot-right jaw B (index 12)
    expect(space.colliders[12].position.x).toBe(CORNER_B_X);
    expect(space.colliders[12].position.z).toBe(-CORNER_B_Z);
    // head-left jaw A (index 13)
    expect(space.colliders[13].position.x).toBe(-CORNER_A_X);
    expect(space.colliders[13].position.z).toBe(CORNER_A_Z);
    // head-left jaw B (index 14)
    expect(space.colliders[14].position.x).toBe(-CORNER_B_X);
    expect(space.colliders[14].position.z).toBe(CORNER_B_Z);
  });

});
