/**
 * CUE-010: Ghost ball and separation line pure-function tests.
 *
 * C# source: CueCalculateManager.DrawShotLinesAndSphere
 *   hitSphere.position = CueBallHitInfo.Point + Normal * ballRadius
 *   separation lines: 4-point polyline from ghost center.
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import {
  ghostCenter,
  computeSeparationLines,
  nearestPocketAlongTarget,
  SEPARATION_LINE_DEFAULT_LENGTH,
  TARGET_TO_DEFLECT_RATIO,
  SP_HARDEN_10_FIXED_AIM_LENGTH,
  SP_HARDEN_10_CANARY,
  POCKET_HIGHLIGHT_RADIUS,
  ASSIST_COLOR_LEGAL,
  ASSIST_COLOR_OUTLINE,
  GHOST_FILL_OPACITY,
} from '../../renderer/ghost-ball';
import { BALL_RADIUS, BALL_Y, POCKET_POSITIONS } from '../../physics/constants';
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

describe('computeSeparationLines — head-on shot (kk ≈ 1) [SP-Harden-10 fixed length]', () => {
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

  it('head-on: cue deflection collapses (dir1=0 → zero length)', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    // Pure head-on: aimDir || direction2 → dir1 length 0 → deflect end = ghost
    expect(pts[1].x).toBeCloseTo(pts[0].x, 3);
    expect(pts[1].z).toBeCloseTo(pts[0].z, 3);
  });

  it('head-on: target extension length equals L (no +2R, no kk scale)', () => {
    // SP-Harden-10 design change: was L+2R under Unity energy01×kk formula
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    const expectedTargetX = g.x + L; // direction2 = +x
    expect(pts[3].x).toBeCloseTo(expectedTargetX, 3);
    expect(pts[3].z).toBeCloseTo(g.z, 3);
  });
});

describe('computeSeparationLines — tangential shot (kk ≈ 0) [SP-Harden-10 fixed length]', () => {
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

  it('tangential: target extension = L (not 2R)', () => {
    // SP-Harden-10: thin cut no longer collapses target arm to 2R
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    const tarLen = Math.sqrt((pts[3].x - g.x) ** 2 + (pts[3].z - g.z) ** 2);
    expect(tarLen).toBeCloseTo(L, 2);
  });

  it('tangential: deflect stub = L / TARGET_TO_DEFLECT_RATIO (8BP 2.2×)', () => {
    // SP-Harden-10: was full L under Unity kk formula; now fixed ratio
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    const defLen = Math.sqrt((pts[1].x - g.x) ** 2 + (pts[1].z - g.z) ** 2);
    expect(defLen).toBeCloseTo(L / TARGET_TO_DEFLECT_RATIO, 2);
  });

  it('tangential: deflection is in +z (perpendicular to target direction)', () => {
    const pts = computeSeparationLines(cueBall, hit, L)!;
    const g = ghostCenter(hit);
    // direction1 for tangential = (0,0,1) since aimDir=(0,0,1) and d2=(-1,0,0)
    expect(pts[1].z).toBeGreaterThan(g.z);  // deflects in +z
    expect(Math.abs(pts[1].x - g.x)).toBeLessThan(0.001);  // no x change
  });
});

describe('SP-Harden-10 — true invariances (not re-skinned Unity tests)', () => {
  const L = 1.0;
  const headOnCue = new CmVector(0, BALL_Y, 0);
  const headOnHit = makeBallHit(
    Math.round((0.5 - R) * M), BALL_Y, 0,
    -M, 0, 0,
  );
  const gx = 0.5 + R;
  const tanCue = new CmVector(Math.round(gx * M), BALL_Y, -5000);
  const tanHit = makeBallHit(5000, BALL_Y, 0, M, 0, 0);

  function targetLen(
    cue: CmVector,
    hit: ReturnType<typeof makeBallHit>,
    lineLen: number,
  ): number {
    const pts = computeSeparationLines(cue, hit, lineLen)!;
    const g = ghostCenter(hit);
    return Math.hypot(pts[3].x - g.x, pts[3].z - g.z);
  }

  it('catch#2: full-ball vs thin-cut, same L → target length identical (kk removed)', () => {
    // Half-fix would drop only energy01 and leave kk — thin cut would still shrink.
    const headLen = targetLen(headOnCue, headOnHit, L);
    const tanLen = targetLen(tanCue, tanHit, L);
    expect(headLen).toBeCloseTo(L, 5);
    expect(tanLen).toBeCloseTo(L, 5);
    expect(Math.abs(headLen - tanLen)).toBeLessThan(1e-9);
  });

  it('catch#2: length is the pure lineLength scalar (no +2R leftover)', () => {
    expect(targetLen(headOnCue, headOnHit, 0.5)).toBeCloseTo(0.5, 5);
    expect(targetLen(tanCue, tanHit, 0.5)).toBeCloseTo(0.5, 5);
    // Old Unity formula at kk≈0 gave ~2R regardless of L — must not regress
    expect(targetLen(tanCue, tanHit, 0.5)).not.toBeCloseTo(2 * R, 2);
  });

  it('deflect stub ≈ target/2 within 1.8–2.4 band', () => {
    expect(TARGET_TO_DEFLECT_RATIO).toBeGreaterThanOrEqual(1.8);
    expect(TARGET_TO_DEFLECT_RATIO).toBeLessThanOrEqual(2.4);
    const pts = computeSeparationLines(tanCue, tanHit, L)!;
    const g = ghostCenter(tanHit);
    const defLen = Math.hypot(pts[1].x - g.x, pts[1].z - g.z);
    expect(defLen).toBeCloseTo(L / TARGET_TO_DEFLECT_RATIO, 5);
  });

  it('canary symbols present for Spot prod fingerprint', () => {
    expect(SP_HARDEN_10_FIXED_AIM_LENGTH).toBe(true);
    expect(SP_HARDEN_10_CANARY).toBe('SP_HARDEN_10_FIXED_AIM_LENGTH');
  });

  it('catch#6 DIV: nearestPocketAlongTarget has no power parameter (geometry only)', () => {
    // Structural: highlight cannot gate on energy if the API has no energy arg.
    expect(nearestPocketAlongTarget.length).toBeLessThanOrEqual(2);
    const end = { x: POCKET_POSITIONS[0][0] / M, z: POCKET_POSITIONS[0][1] / M };
    expect(nearestPocketAlongTarget(end)).not.toBeNull();
  });

  it('catch#6: pocket decision is endpoint-only — same for any power (power not an input)', () => {
    // Simulate update path: fixed L → same linePts[3] → same highlight, independent of power.
    // (ghostBall.update voids powerFraction before computeSeparationLines.)
    const L = 1.5;
    const pts = computeSeparationLines(headOnCue, headOnHit, L)!;
    const end = { x: pts[3].x, z: pts[3].z };
    // Call thrice as if power=0.2 / 0.5 / 1.0 — result must be identical (no power arg to vary).
    const a = nearestPocketAlongTarget(end);
    const b = nearestPocketAlongTarget(end);
    const c = nearestPocketAlongTarget(end);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('hard assert ② measured: full-ball targetLen === thin-cut targetLen (same L)', () => {
    // Explicit equal-length measurement (not just "still visible") — catches kk half-fix.
    const L = 0.75;
    const full = targetLen(headOnCue, headOnHit, L);
    const thin = targetLen(tanCue, tanHit, L);
    // Report-style values for Spot: both must be L within float noise
    expect(full).toBeCloseTo(0.75, 6);
    expect(thin).toBeCloseTo(0.75, 6);
    expect(full).toBeCloseTo(thin, 9);
  });
});

describe('SEPARATION_LINE_DEFAULT_LENGTH — default Aim scalar', () => {
  it('default target extension is 0.25m (historical Unity lineDistance default)', () => {
    // SP-Harden-10: still the default slider-A value; no longer energy01 budget.
    expect(SEPARATION_LINE_DEFAULT_LENGTH).toBe(0.25);
  });
});

describe('SP-Harden-8 ghost contrast', () => {
  it('legal fill is not pure white (readable on light object balls)', () => {
    expect(ASSIST_COLOR_LEGAL).not.toBe(0xffffff);
  });

  it('dark outline colour is near-black', () => {
    expect(ASSIST_COLOR_OUTLINE).toBeLessThan(0x222222);
  });

  it('fill opacity is stronger than the old 0.45 blend-away value', () => {
    expect(GHOST_FILL_OPACITY).toBeGreaterThan(0.45);
  });
});

// ─── nearestPocketAlongTarget (SP-Harden-5 pocket highlight) ─────────────────

describe('nearestPocketAlongTarget', () => {
  it('returns pocket when endpoint is within 2R of a corner pocket', () => {
    // Corner +x +z portActual (13110, 6740) → world metres
    const px = POCKET_POSITIONS[0][0] / MULTIPLIER;
    const pz = POCKET_POSITIONS[0][1] / MULTIPLIER;
    const hit = nearestPocketAlongTarget({ x: px + 0.01, z: pz - 0.01 });
    expect(hit).not.toBeNull();
    expect(hit!.pocketIndex).toBe(0);
    expect(hit!.x).toBeCloseTo(px, 5);
    expect(hit!.z).toBeCloseTo(pz, 5);
  });

  it('returns null when endpoint is far from all pockets', () => {
    expect(nearestPocketAlongTarget({ x: 0, z: 0 })).toBeNull();
  });

  it('POCKET_HIGHLIGHT_RADIUS equals 2 * ball radius (Unity pocketRadius)', () => {
    expect(POCKET_HIGHLIGHT_RADIUS).toBeCloseTo(2 * (BALL_RADIUS / MULTIPLIER), 10);
  });
});
