/**
 * CUE-004 + CUE-015: Vertical angle helpers — pure functions, no Three.js.
 *
 * Ports C# CueLimitManager.GetVerticalAngle:
 *   min elevation to clear the table wall + blocking balls in the aim path.
 *
 * All positions are in float meters (Fixed / MULTIPLIER).
 * This file has NO side-effects — safe to import in unit tests.
 */

import { BALL_RADIUS, RAIL_LONG_X, RAIL_BACK_Z } from '../physics/constants';
import { MULTIPLIER } from '../physics/fixed-math';

/** Minimum cue elevation (degrees); cue horizontal against table. */
export const MIN_VERTICAL_ANGLE = 0;

/** Maximum cue elevation (degrees); above this a massé shot is impractical. */
export const MAX_VERTICAL_ANGLE = 70;

/** Ball diameter in float meters — height delta the cue must clear. */
const DIAM_F = (2 * BALL_RADIUS) / MULTIPLIER;

/** Table rail boundaries in float meters. */
const RAIL_LONG_XF = RAIL_LONG_X / MULTIPLIER;
const RAIL_BACK_ZF = RAIL_BACK_Z / MULTIPLIER;

const RAD_DEG = 180 / Math.PI;

/**
 * Horizontal distance (meters) from (cueBallX, cueBallZ) to the nearest table
 * wall when travelling in direction (aimDirX, aimDirZ) (must be normalised).
 *
 * Used as `distToWall` input for computeMinVerticalAngle.
 */
export function distToWallMeters(
  cueBallX: number, cueBallZ: number,
  aimDirX: number, aimDirZ: number,
): number {
  let minDist = Infinity;

  if (Math.abs(aimDirX) > 1e-9) {
    const wallX = aimDirX > 0 ? RAIL_LONG_XF : -RAIL_LONG_XF;
    const d = (wallX - cueBallX) / aimDirX;
    if (d > 0) minDist = Math.min(minDist, d);
  }

  if (Math.abs(aimDirZ) > 1e-9) {
    const wallZ = aimDirZ > 0 ? RAIL_BACK_ZF : -RAIL_BACK_ZF;
    const d = (wallZ - cueBallZ) / aimDirZ;
    if (d > 0) minDist = Math.min(minDist, d);
  }

  return isFinite(minDist) ? minDist : 10;
}

/**
 * Minimum vertical angle (degrees, ≥ 0) required so the cue clears:
 *   1. The table wall in the aim direction.
 *   2. Any blocking ball whose lateral offset from the aim line < 0.7 × diameter.
 *
 * Faithful port of CueLimitManager.GetVerticalAngle (minus the currentAngle clamp;
 * apply that via applyAutoLift after calling this function).
 *
 * @param cueBall  Cue ball XZ position in float meters.
 * @param aimDir   Normalised aim direction (XZ).
 * @param otherBalls  Other balls' XZ positions in float meters (kinematic/pocketed excluded).
 * @param distToWall  Distance to wall in aim direction (use distToWallMeters).
 */
export function computeMinVerticalAngle(
  cueBall: { x: number; z: number },
  aimDir: { x: number; z: number },
  otherBalls: Array<{ x: number; z: number }>,
  distToWall: number,
): number {
  // Minimum angle to clear the table rail at distToWall
  const wallAngle = RAD_DEG * Math.atan2(DIAM_F, distToWall);

  let maxBallAngle = 0;

  for (const ball of otherBalls) {
    const bdx = ball.x - cueBall.x;
    const bdz = ball.z - cueBall.z;
    const ballDistXZ = Math.sqrt(bdx * bdx + bdz * bdz);
    if (ballDistXZ < 1e-6) continue;

    // dot( ballDir, -aimDir ) > 0 → ball is ahead of cue in aim direction
    const dotFwd = (bdx / ballDistXZ) * (-aimDir.x) + (bdz / ballDistXZ) * (-aimDir.z);
    if (dotFwd <= 0) continue;

    // Lateral distance from aim line: ballDistXZ × sin(angle between ballDir and aimDir)
    const sinAngle = Math.sqrt(Math.max(0, 1 - dotFwd * dotFwd));
    const lateralDist = ballDistXZ * sinAngle;

    if (lateralDist < 0.7 * DIAM_F) {
      // Ball is close enough to the aim line to block the cue — compute clearance angle
      const angle = 1.5 * RAD_DEG * Math.atan2(DIAM_F, ballDistXZ);
      if (angle > maxBallAngle) maxBallAngle = angle;
    }
  }

  return Math.max(wallAngle, maxBallAngle);
}

/**
 * Apply auto-lift: return the clamped effective vertical angle.
 * The user's requested angle is honoured if it already exceeds the computed minimum;
 * otherwise the minimum is enforced. Result is always in [0, MAX_VERTICAL_ANGLE].
 */
export function applyAutoLift(userAngle: number, minAngle: number): number {
  const clamped = Math.max(Math.min(userAngle, MAX_VERTICAL_ANGLE), 0);
  return Math.max(clamped, minAngle);
}
