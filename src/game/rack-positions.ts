/**
 * GAME-010 — 8-ball triangle rack positions.
 * Faithful port of C# BallPool8Manager.GetBallPosition + delta array.
 * All values in fixed-point (MULTIPLIER = 10000).
 *
 * C# formula: position = firstBall + Vector3(delta.x * sqrt(3) * distance, 0, delta.y * distance)
 * where distance = BallDiameter/2 + ballDistance (ballDistance ≈ gap/2 from table-setup spacing).
 *
 * Web equivalent uses the same spacing constants as table-setup.ts.
 */

import { BALL_RADIUS, RAIL_LONG_X } from '../physics/constants';

// C# BallPool8Manager delta array indexed by ball id (0–15).
// delta[id] = [rowOffset, colOffset] from the foot-spot apex.
// row: steps along the long table axis (x); col: lateral steps (z).
// Ball id 8 (black ball) is at (2, 0) = center of the 3-ball row ✓
const DELTA: ReadonlyArray<readonly [number, number]> = [
  [ 0,  0],  //  0: cue ball — handled separately
  [ 0,  0],  //  1: apex
  [ 3,  3],  //  2
  [ 4, -4],  //  3
  [ 4,  0],  //  4
  [ 1,  1],  //  5
  [ 3, -1],  //  6
  [ 4,  4],  //  7
  [ 2,  0],  //  8: BLACK BALL — center of rack
  [ 2,  2],  //  9
  [ 2, -2],  // 10
  [ 3,  1],  // 11
  [ 3, -3],  // 12
  [ 1, -1],  // 13
  [ 4, -2],  // 14
  [ 4,  2],  // 15
];

// Spacing between adjacent ball centers (same as table-setup.ts)
const BALL_SPACING = BALL_RADIUS * 2 + 5;

/**
 * Step along the long axis per delta row unit.
 * Matches C# delta.x * sqrt(2*distance^2 - distance^2) = delta.x * sqrt(3) * distance.
 * Approximated as spacing * 866/1000 (consistent with table-setup rowDx).
 */
export const RACK_ROW_STEP = Math.trunc(BALL_SPACING * 866 / 1000);

/** Lateral step per delta col unit = half-spacing. */
export const RACK_COL_STEP = Math.trunc(BALL_SPACING / 2);

/** X position of the rack apex (foot spot, positive-x half of table). */
export const RACK_APEX_X = Math.trunc(RAIL_LONG_X / 2);

/** X position of cue ball at break (opposite side). */
export const CUE_BALL_START_X = -RACK_APEX_X;

/**
 * Return the fixed-point { x, z } position for a ball id in the rack.
 * Ball 0 (cue): placed at CUE_BALL_START_X.
 * Balls 1–15: triangle positions per C# delta array.
 */
export function getRackPosition(id: number): { x: number; z: number } {
  if (id === 0) {
    return { x: CUE_BALL_START_X, z: 0 };
  }
  const [dr, dc] = DELTA[id] ?? [0, 0];
  return {
    x: RACK_APEX_X + dr * RACK_ROW_STEP,
    z: dc * RACK_COL_STEP,
  };
}

/** All rack positions as an array indexed by ball id (0–15). */
export function getAllRackPositions(): ReadonlyArray<{ x: number; z: number }> {
  return Array.from({ length: 16 }, (_, id) => getRackPosition(id));
}
