/**
 * CUE-010: Ghost ball and separation line pure-function tests.
 *
 * C# source: CueCalculateManager.DrawShotLinesAndSphere
 *   hitSphere.position = CueBallHitInfo.Point + Normal * ballRadius
 *   separation lines: 4-point polyline from ghost center.
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { ghostCenter, computeSeparationLines, SEPARATION_LINE_DEFAULT_LENGTH } from '../../renderer/ghost-ball';
import { BALL_RADIUS, BALL_Y } from '../../physics/constants';
import { MULTIPLIER } from '../../physics/fixed-math';
import type { AimHit } from '../../game/ball-pool-physics';

const M = MULTIPLIER;
const R = BALL_RADIUS / M;  // 0.0285m

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBallHit(
  pointX: number, pointY: number, pointZ: number,
  normalX: number, normalY: number, normalZ: number,
): AimHit {
  return {
    hitType: 'ball',
    ballId: 1,
    cushionId: null,
    point: new CmVector(pointX, pointY, pointZ),
    normal: new CmVector(normalX, normalY, normalZ),
    distance: 1,
  };
}

function makeCushionHit(
  pointX: number, pointY: number, pointZ: number,
  normalX: number, normalY: number, normalZ: number,
): AimHit {
  return {
    hitType: 'cushion',
    ballId: null,
    cushionId: 0,
    point: new CmVector(pointX, pointY, pointZ),
    normal: new CmVector(normalX, normalY, normalZ),
    distance: 1,
  };
}

// ─── ghostCenter ─────────────────────────────────────────────────────────────

describe('ghostCenter — ball hit', () => {
  it('ghost = contact_point + r * normal (head-on, +x direction)', () => {
    // Target at 0.5m along x. Normal = (-1,0,0) (from target toward cue at origin)
    // hit.point = target + r * normal = (0.5 - 0.0285, BALL_Y/M, 0)
    const hit = makeBallHit(
      Math.round((0.5 - R) * M), BALL_Y, 0,
      -M, 0, 0,  // unit normal in -x direction
    );
    const g = ghostCenter(hit);
    // ghost = hit.point/M + r * normal/M = (0.5 - r) + r * (-1) = 0.5 - 2r
    expect(g.x).toBeCloseTo(0.5 - 2 * R);
    expect(g.y).toBeCloseTo(BALL_Y / M);
    expect(g.z).toBeCloseTo(0);
  });

  it('ghost = cue ball center at contact (z-direction hit)', () => {
    // Target at (0, BALL_Y, 0.5). Normal = (0,0,-1) (target→cue, cue at smaller z)
    const hit = makeBallHit(
      0, BALL_Y, Math.round((0.5 - R) * M),
      0, 0, -M,
    );
    const g = ghostCenter(hit);
    expect(g.x).toBeCloseTo(0);
    expect(g.y).toBeCloseTo(BALL_Y / M);
    expect(g.z).toBeCloseTo(0.5 - 2 * R);
  });

  it('ghost = hit.point/M + r * unit_normal', () => {
    // Generic: normal = (+1, 0, 0), hit.point = (3000, BALL_Y, 0)
    const hit = makeBallHit(3000, BALL_Y, 0, M, 0, 0);
    const g = ghostCenter(hit);
    expect(g.x).toBeCloseTo(0.3 + R);
    expect(g.y).toBeCloseTo(BALL_Y / M);
    expect(g.z).toBeCloseTo(0);
  });
});

describe('ghostCenter — cushion hit', () => {
  it('ghost = rail_contact + r * inward_normal', () => {
    // Rail surface at (4000, BALL_Y, 0). Inward normal = (-1, 0, 0)
    const hit = makeCushionHit(4000, BALL_Y, 0, -M, 0, 0);
    const g = ghostCenter(hit);
    expect(g.x).toBeCloseTo(0.4 - R);
    expect(g.y).toBeCloseTo(BALL_Y / M);
    expect(g.z).toBeCloseTo(0);
  });
});

// ─── computeSeparationLines ───────────────────────────────────────────────────

describe('computeSeparationLines — non-ball hits return null', () => {
  it('cushion hit: returns null', () => {
    const hit = makeCushionHit(4000, BALL_Y, 0, -M, 0, 0);
    const cueBall = new CmVector(0, BALL_Y, 0);
    expect(computeSeparationLines(cueBall, hit, 0.8)).toBeNull();
  });

  it('none hit: returns null', () => {
    const hit: AimHit = {
      hitType: 'none', ballId: null, cushionId: null,
      point: new CmVector(0, BALL_Y, 0), normal: CmVector.zero, distance: 0,
    };
    expect(computeSeparationLines(new CmVector(0, BALL_Y, 0), hit, 0.8)).toBeNull();
  });
});

describe('computeSeparationLines — head-on shot (kk ≈ 1)', () => {
  // Cue at origin, target at +x. Normal = (-1,0,0). kk = 1.
  // hit.point = (0.5 - R) * M in x (contact on target surface)
  // Ghost = (0.5 - 2R, BALL_Y/M, 0)
  const cueBall = new CmVector(0, BALL_Y, 0);
  const hit = makeBallHit(
    Math.round((0.5 - R) * M), BALL_Y, 0,
    -M, 0, 0,
  );
  const L = 0.8;

  it('returns array of 4 points', () => {
    const pts = computeSeparationLines(cueBall, hit, L);
    expect(pts).not.toBeNull();
    expect(pts!.length).toBe(4);
  });

  it('pts[0] and pts[2] = ghost center', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    expect(pts[0].x).toBeCloseTo(g.x);
    expect(pts[0].z).toBeCloseTo(g.z);
    expect(pts[2].x).toBeCloseTo(g.x);
    expect(pts[2].z).toBeCloseTo(g.z);
  });

  it('head-on: cue deflection line has zero length (pts[0] ≈ pts[1])', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    // kk=1 → s1 = clamp(1.5 - 1.5*1) = 0 → deflect end = ghost center
    expect(pts[1].x).toBeCloseTo(pts[0].x, 3);
    expect(pts[1].z).toBeCloseTo(pts[0].z, 3);
  });

  it('head-on: target ball line has full length L + 2r', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    // kk=1 → s2 = clamp(1.5*1)*L + 2r = L + 2r, direction2 = +x (= -normal = (1,0,0))
    const expectedTargetX = g.x + (L + 2 * R);
    expect(pts[3].x).toBeCloseTo(expectedTargetX, 3);
    expect(pts[3].z).toBeCloseTo(g.z, 3);
  });
});

describe('computeSeparationLines — tangential shot (kk ≈ 0)', () => {
  // Cue at (ghost.x * M, BALL_Y, -5000), target normal = (1,0,0) → d2 = (-1,0,0).
  // aimDir = (0,0,1) (+z). d2·aimDir = 0 → kk=0.
  // hit.normal = (M, 0, 0), hit.point = (5000, BALL_Y, 0)
  // ghost = (0.5 + R, BALL_Y/M, 0)
  // cue at (ghost.x * M, BALL_Y, -5000) → (0.5285 * M, BALL_Y, -5000) → (5285, BALL_Y, -5000)
  const gx = 0.5 + R;
  const cueBall = new CmVector(Math.round(gx * M), BALL_Y, -5000);
  const hit = makeBallHit(5000, BALL_Y, 0, M, 0, 0);
  const L = 0.8;

  it('returns 4 points', () => {
    const pts = computeSeparationLines(cueBall, hit, L);
    expect(pts).not.toBeNull();
    expect(pts!.length).toBe(4);
  });

  it('tangential: cue deflection line has full length (≈ L)', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    // kk=0 → s1 = clamp(1.5) = 1 → deflection length = L
    // direction1 = (0,0,1) (same as aimDir, no target component)
    const g = ghostCenter(hit);
    const defLen = Math.sqrt((pts[1].x - g.x) ** 2 + (pts[1].z - g.z) ** 2);
    expect(defLen).toBeCloseTo(L, 2);
  });

  it('tangential: target ball line has minimum length (≈ 2r)', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    // kk=0 → s2 = clamp(0)*L + 2r = 2r, direction2 = -x (-normal)
    const g = ghostCenter(hit);
    const tarLen = Math.sqrt((pts[3].x - g.x) ** 2 + (pts[3].z - g.z) ** 2);
    expect(tarLen).toBeCloseTo(2 * R, 2);
  });

  it('tangential: deflection is in +z (perpendicular to target direction)', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    // direction1 for tangential = (0,0,1) since aimDir=(0,0,1) and d2=(-1,0,0)
    // perp component of (0,0,1) w.r.t. (-1,0,0) = (0,0,1) (unchanged, already perp)
    expect(pts[1].z).toBeGreaterThan(g.z);  // deflects in +z
    expect(Math.abs(pts[1].x - g.x)).toBeLessThan(0.001);  // no x change
  });
});

describe('SEPARATION_LINE_DEFAULT_LENGTH', () => {
  it('is positive', () => {
    expect(SEPARATION_LINE_DEFAULT_LENGTH).toBeGreaterThan(0);
  });
});
