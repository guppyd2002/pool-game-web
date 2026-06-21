/**
 * GAME-010 — 8-ball triangle rack positions.
 *
 * Values are hardcoded from C# runner `GetBallPosition(0..15)` float output
 * × multiplier 10000, trunc-toward-zero (i.e. `(long)` cast).
 *
 * C# source geometry (BallPool8Manager + BallPoolSettings.asset + Game.unity):
 *   firstBall.localPosition.x = 0.6413  → apex x = 6413
 *   ballDiameter = 0.05715, ballDistance = 0
 *   distance = ballDiameter/2 + ballDistance = 0.028575
 *   row step ≈ distance × √3 ≈ 0.049494 → 494.94 (per-ball trunc from full float)
 *   col step = distance = 0.028575 → 285.75 (per-ball trunc from full float)
 *
 * ⚠  DO NOT recalculate positions at runtime from constants — per-ball float
 * precision and trunc interaction means the formula cannot reproduce the C#
 * integers exactly (e.g. ball2 z=857 ≠ 3×285). The table below is the single
 * source of truth for both physics initialization and visual reset.
 */

/** Fixed-point (x, z) positions indexed by ball id 0–15. */
const POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [-6413,     0],   //  0: cue ball at break spot (= -firstBall.x)
  [ 6413,     0],   //  1: apex / foot spot
  [ 7897,   857],   //  2
  [ 8392, -1143],   //  3
  [ 8392,     0],   //  4
  [ 6907,   285],   //  5
  [ 7897,  -285],   //  6
  [ 8392,  1143],   //  7
  [ 7402,     0],   //  8: BLACK BALL — z=0 (center of rack) ✓
  [ 7402,   571],   //  9
  [ 7402,  -571],   // 10
  [ 7897,   285],   // 11
  [ 7897,  -857],   // 12
  [ 6907,  -285],   // 13
  [ 8392,  -571],   // 14
  [ 8392,   571],   // 15
];

/** X position of the rack apex (foot spot). From C# firstBall.localPosition.x=0.6413. */
export const RACK_APEX_X = 6413;

/** X position of cue ball at break (opposite side). From C# −firstBall.x. */
export const CUE_BALL_START_X = -6413;

/**
 * Return the fixed-point { x, z } position for a ball id (0–15).
 * Sourced from C# GetBallPosition float dump, NOT recomputed from constants.
 */
export function getRackPosition(id: number): { x: number; z: number } {
  const [x, z] = POSITIONS[id] ?? POSITIONS[0];
  return { x, z };
}

/** All rack positions as a read-only array indexed by ball id (0–15). */
export function getAllRackPositions(): ReadonlyArray<{ x: number; z: number }> {
  return POSITIONS.map(([x, z]) => ({ x, z }));
}
