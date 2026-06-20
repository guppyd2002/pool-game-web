/**
 * CUE-004 + CUE-015: vertical angle pure helper tests.
 *
 * C# source insight (RotationQuadManager.GetQuadPosition):
 *   pointOnQuad = cueBall - r * targetingForward
 * ⟹ wall distance is measured in the HANDLE direction (−aimDir, toward the player).
 *    Blocking balls are also in the −aimDir hemisphere: the cue shaft passes through
 *    the area behind the cue ball on the backswing.
 *
 * Verified against CueLimitManager.cs line 57:
 *   Dot(ballPointDirection, -targetingForward) > 0
 *   ⟹ -targetingForward = aimDir → balls whose direction dot aimDir < 0 (behind cue) trigger lift.
 *   Wait, double-negative: Dot(ballDir, -forward) = Dot(ballDir, -aimDir) at line 57.
 *   But GetQuadPosition shows forward = aimDir and result = pivotPos - r*forward (behind).
 *   So Dot(ballDir, -aimDir) > 0 ⟹ ballDir points in -aimDir direction ⟹ ball is BEHIND cue ball.
 */
import { describe, it, expect } from 'vitest';
import {
  distToWallMeters, computeMinVerticalAngle, applyAutoLift,
  MAX_VERTICAL_ANGLE,
} from '../../game/cue-vertical';
import { BALL_RADIUS, RAIL_LONG_X, RAIL_BACK_Z } from '../../physics/constants';
import { MULTIPLIER } from '../../physics/fixed-math';

const DIAM_F = 2 * BALL_RADIUS / MULTIPLIER;   // ball diameter in float meters
const RAIL_LONG_XF = RAIL_LONG_X / MULTIPLIER;  // 1.2699 m
const RAIL_BACK_ZF = RAIL_BACK_Z / MULTIPLIER;  // 0.6349 m

// ─── distToWallMeters ────────────────────────────────────────────────────────
// This is a pure "ray-to-wall" helper. Callers use it with −aimDir to get the
// handle-side distance. These tests verify the geometry is correct.

describe('distToWallMeters: axis-aligned shots', () => {
  it('from center, +X → right wall at RAIL_LONG_X/M', () => {
    expect(distToWallMeters(0, 0, 1, 0)).toBeCloseTo(RAIL_LONG_XF, 6);
  });

  it('from center, -X → left wall at RAIL_LONG_X/M', () => {
    expect(distToWallMeters(0, 0, -1, 0)).toBeCloseTo(RAIL_LONG_XF, 6);
  });

  it('from center, +Z → back wall at RAIL_BACK_Z/M', () => {
    expect(distToWallMeters(0, 0, 0, 1)).toBeCloseTo(RAIL_BACK_ZF, 6);
  });

  it('from center, -Z → front wall at RAIL_BACK_Z/M', () => {
    expect(distToWallMeters(0, 0, 0, -1)).toBeCloseTo(RAIL_BACK_ZF, 6);
  });
});

describe('distToWallMeters: offset start position', () => {
  it('from x=0.5m shooting +X → hits right wall at (RAIL_LONG_XF - 0.5)', () => {
    expect(distToWallMeters(0.5, 0, 1, 0)).toBeCloseTo(RAIL_LONG_XF - 0.5, 6);
  });

  it('from x=-0.5m shooting +X → longer path (RAIL_LONG_XF + 0.5)', () => {
    expect(distToWallMeters(-0.5, 0, 1, 0)).toBeCloseTo(RAIL_LONG_XF + 0.5, 6);
  });
});

describe('distToWallMeters: handle-side usage (−aimDir)', () => {
  // Simulate cue ball near left wall (-1.2m), shooting toward +X.
  // Handle is on the -X side; pass -aimDir to get the handle-wall distance.
  it('cue near left wall, shooting +X: handle-side dist = 0.0699m', () => {
    const cueBallX = -RAIL_LONG_XF + 0.07;  // ≈ 0.07m from left wall
    // Pass -aimDir = (-1, 0) to find wall in handle direction
    expect(distToWallMeters(cueBallX, 0, -1, 0)).toBeCloseTo(0.07, 4);
  });

  it('cue at center shooting +X: handle-side wall = RAIL_LONG_XF', () => {
    // From center, -aimDir = (-1,0) hits the left wall at RAIL_LONG_XF
    expect(distToWallMeters(0, 0, -1, 0)).toBeCloseTo(RAIL_LONG_XF, 6);
  });
});

describe('distToWallMeters: diagonal shots take min wall', () => {
  it('45° shot (+X, +Z) from center: min of X-wall and Z-wall distances', () => {
    const s = Math.SQRT1_2;
    const d = distToWallMeters(0, 0, s, s);
    // X-wall at RAIL_LONG_XF/s, Z-wall at RAIL_BACK_ZF/s
    const expectedMin = Math.min(RAIL_LONG_XF / s, RAIL_BACK_ZF / s);
    expect(d).toBeCloseTo(expectedMin, 4);
  });
});

// ─── computeMinVerticalAngle ──────────────────────────────────────────────────
// IMPORTANT: distToWall parameter = distance to wall in the HANDLE direction (−aimDir).
//            Blocking balls are those in the −aimDir hemisphere (behind the cue ball).

describe('computeMinVerticalAngle: wall-only (no balls)', () => {
  it('close to wall: higher angle than far from wall', () => {
    const nearAngle = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], 0.05);
    const farAngle  = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], 1.5);
    expect(nearAngle).toBeGreaterThan(farAngle);
  });

  it('wall angle = atan2(DIAM_F, distToWall) * RAD_DEG', () => {
    const distToWall = 0.5;
    const expected = (180 / Math.PI) * Math.atan2(DIAM_F, distToWall);
    const result = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], distToWall);
    expect(result).toBeCloseTo(expected, 4);
  });

  it('large distToWall → angle approaches 0', () => {
    const result = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], 50);
    expect(result).toBeLessThan(1);
  });
});

describe('computeMinVerticalAngle: ball obstacles', () => {
  // Balls in the HANDLE direction (−aimDir = −X for aimDir=+X) trigger auto-lift.
  // Balls in the SHOT direction (+X) do NOT trigger auto-lift.

  it('ball in handle path (behind cue ball, −aimDir) → higher angle', () => {
    const wallDist = RAIL_LONG_XF;  // center of table, handle toward left wall
    const wallOnly = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], wallDist);
    // Ball at x=-0.3 (in -X direction from cue ball = handle side for +X aim)
    const withBall = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 },
      [{ x: -0.3, z: 0 }],
      wallDist,
    );
    expect(withBall).toBeGreaterThan(wallOnly);
  });

  it('ball angle formula: 1.5 * atan2(DIAM_F, ballDist) * RAD_DEG', () => {
    const ballDist = 0.4;
    // Ball at x=−ballDist (directly behind in handle direction), aimDir=+X
    const expected = 1.5 * (180 / Math.PI) * Math.atan2(DIAM_F, ballDist);
    const result = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 },
      [{ x: -ballDist, z: 0 }],
      5,  // large distToWall so ball angle dominates
    );
    expect(result).toBeCloseTo(expected, 3);
  });

  it('ball in SHOT direction (+aimDir, in front of cue ball): no extra angle', () => {
    // This ball is in the shot path, NOT the handle path — cue doesn't swing there
    const wallDist = RAIL_LONG_XF;
    const wallOnly = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], wallDist);
    // Ball at x=+0.3 (in +X direction = shot direction, in front of cue ball)
    const withFront = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 },
      [{ x: 0.3, z: 0 }],
      wallDist,
    );
    expect(withFront).toBeCloseTo(wallOnly, 4);
  });

  it('ball behind but far to the side (lateral dist > 0.7×DIAM): no extra angle', () => {
    const wallDist = RAIL_LONG_XF;
    const wallOnly = computeMinVerticalAngle({ x: 0, z: 0 }, { x: 1, z: 0 }, [], wallDist);
    // Ball at (−0.3, 1.0): behind cue ball but laterally far off aim line
    // lateral ≈ 1.0m >> 0.7 × DIAM_F ≈ 0.04m
    const withSide = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 },
      [{ x: -0.3, z: 1.0 }],
      wallDist,
    );
    expect(withSide).toBeCloseTo(wallOnly, 4);
  });

  it('multiple balls: takes max of required angles', () => {
    // Both behind (handle side), different distances
    const close = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 }, [{ x: -0.2, z: 0 }], 5,
    );
    const far = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 }, [{ x: -0.8, z: 0 }], 5,
    );
    const both = computeMinVerticalAngle(
      { x: 0, z: 0 }, { x: 1, z: 0 }, [{ x: -0.2, z: 0 }, { x: -0.8, z: 0 }], 5,
    );
    expect(both).toBeCloseTo(close, 4);  // close ball dominates
    expect(both).toBeGreaterThan(far);
  });
});

// ─── applyAutoLift ───────────────────────────────────────────────────────────

describe('applyAutoLift', () => {
  it('user angle > min: returns user angle', () => {
    expect(applyAutoLift(30, 10)).toBe(30);
  });

  it('user angle < min: returns min (auto-lifts)', () => {
    expect(applyAutoLift(5, 20)).toBe(20);
  });

  it('user angle = min: returns that angle', () => {
    expect(applyAutoLift(15, 15)).toBe(15);
  });

  it('clamps to MAX_VERTICAL_ANGLE', () => {
    expect(applyAutoLift(90, 0)).toBe(MAX_VERTICAL_ANGLE);
  });

  it('clamps negative user angle to 0', () => {
    expect(applyAutoLift(-10, 0)).toBe(0);
  });
});
