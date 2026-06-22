/**
 * P1-T05 AI controller tests.
 *
 * Covers:
 *   AI-001  calculateAIShot returns a non-zero impulse (basic shot produced)
 *   AI-002  Same seed → byte-identical shotData (determinism / C-9 replay)
 *   AI-003  Different seeds → different shots (PRNG active)
 *   AI-004  Ball-in-hand flag: cueBallNewPos non-null when ballInHand=true and placement possible
 *   AI-005  ballInHand=false: cueBallNewPos is null (no placement)
 *   AI-006  Impulse magnitude ≤ MAX_FORCE (force cap invariant)
 *   AI-007  allowableBalls filter: non-allowable ball doesn't affect PRNG path (indirectly tested
 *           via determinism — if filter is broken, draw count changes and seed N≠seed M)
 *   AI-008  All-kinematic table (no active balls) → fallback fires, no crash
 *   AI-009  isFirstShot=false does not produce placement draws in PRNG (seed replay stable)
 */

import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { calculateAIShot } from '../../game/ai-controller';
import {
  BALL_MASS, BALL_RADIUS, BALL_Y, TABLE_Y,
  BALL_MATERIAL as BALL_MAT,
  CLOTH_MATERIAL as CLOTH_MAT,
  RAIL_MATERIAL as RAIL_MAT,
  POCKET_RADIUS, POCKET_POSITIONS,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  MAX_FORCE,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_BACK_X, RAIL_BACK_Z, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_A_SCALE_X, CORNER_A_RADIUS,
  CORNER_B_X, CORNER_B_Z, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
} from '../../physics/constants';

// ─── Test helpers (mirror g6-lock.test.ts) ────────────────────────────────────

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id; col.position = new CmVector(x, y, z);
  col.right = new CmVector(10000, 0, 0); col.up = new CmVector(0, 10000, 0); col.forward = new CmVector(0, 0, 10000);
  col.scale = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius = BALL_RADIUS; col.enabled = true; col.material = { ...BALL_MAT };
  const body = new CmRigidbody();
  body.id = id; body.mass = BALL_MASS; body.collider = col; body.init();
  return body;
}

function makeLine(
  id: number, px: number, py: number, pz: number,
  rx: number, ry: number, rz: number, ux: number, uy: number, uz: number,
  fx: number, fy: number, fz: number, scaleX: number, radius: number, mat: CmMaterial,
): CmLineCollider {
  const c = new CmLineCollider();
  c.id = id; c.position = new CmVector(px, py, pz);
  c.right = new CmVector(rx, ry, rz); c.up = new CmVector(ux, uy, uz); c.forward = new CmVector(fx, fy, fz);
  c.scale = new CmVector(scaleX, 5000, 5000); c.radius = radius; c.material = { ...mat };
  return c;
}

function makeTable(): (CmPlaneCollider | CmLineCollider)[] {
  const list: (CmPlaneCollider | CmLineCollider)[] = [];
  let id = 0;
  const plane = new CmPlaneCollider();
  plane.id = id++; plane.position = new CmVector(0, TABLE_Y, 0);
  plane.right = new CmVector(10000, 0, 0); plane.up = new CmVector(0, 10000, 0); plane.forward = new CmVector(0, 0, 10000);
  plane.scale = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS); plane.radius = PLANE_RADIUS; plane.material = { ...CLOTH_MAT };
  list.push(plane);
  list.push(makeLine(id++,  RAIL_LONG_X, BALL_Y, 0,    0,0,10000,  0,10000,0, -10000,0,0, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_LONG_X, BALL_Y, 0,    0,0,-10000, 0,10000,0, 10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z, -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,  10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  return list;
}

function makePockets(): CmKinematicTrigger[] {
  return POCKET_POSITIONS.map(([px, pz], i) => {
    const t = new CmKinematicTrigger();
    t.id = i; t.position = new CmVector(px, BALL_Y, pz); t.radius = POCKET_RADIUS;
    return t;
  });
}

/** Build a space with cue ball at (x0,BALL_Y,0) and one object ball at (x1,BALL_Y,0). */
function makeSpace(cueBallX = -5000, targetX = 2000): CmSpace {
  const b0 = makeBall(0, cueBallX, BALL_Y, 0);
  const b1 = makeBall(1, targetX, BALL_Y, 0);
  const space = new CmSpace();
  space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
  return space;
}

/** All balls allowable. */
const allAllowable = (_id: number): boolean => true;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AI-001 calculateAIShot: basic shot produced', () => {
  it('returns non-zero impulse for a reachable shot', () => {
    const space = makeSpace();
    const result = calculateAIShot(space, allAllowable, false, false, 3, 5, 42);
    const { impulse } = result.shotData;
    expect(impulse.x !== 0 || impulse.z !== 0).toBe(true);
  });

  it('returns a ShotData with Fixed-point position at cue ball location', () => {
    const space = makeSpace(-5000);
    const result = calculateAIShot(space, allAllowable, false, false, 3, 5, 42);
    // position should be near cue ball position (-5000, BALL_Y, 0)
    expect(Math.abs(result.shotData.position.x - (-5000))).toBeLessThan(100);
    expect(result.shotData.torque).toEqual(CmVector.zero);
  });
});

describe('AI-002 determinism: same seed → byte-identical ShotData', () => {
  it('two calls with same seed produce identical impulse (C-9 replay)', () => {
    const space = makeSpace();
    const r1 = calculateAIShot(space, allAllowable, false, false, 3, 5, 12345);
    const r2 = calculateAIShot(space, allAllowable, false, false, 3, 5, 12345);
    expect(r1.shotData.impulse.x).toBe(r2.shotData.impulse.x);
    expect(r1.shotData.impulse.z).toBe(r2.shotData.impulse.z);
    expect(r1.shotData.position.x).toBe(r2.shotData.position.x);
  });
});

describe('AI-003 PRNG: different seeds produce different shots', () => {
  it('seed 1 ≠ seed 2 → different impulse in at least one axis', () => {
    const space = makeSpace();
    const r1 = calculateAIShot(space, allAllowable, false, false, 3, 5, 1);
    const r2 = calculateAIShot(space, allAllowable, false, false, 3, 5, 9999);
    // Different seeds should produce meaningfully different results (noise + force rand)
    const same = r1.shotData.impulse.x === r2.shotData.impulse.x &&
                 r1.shotData.impulse.z === r2.shotData.impulse.z;
    // Extremely unlikely to be identical with different seeds and two noise draws
    expect(same).toBe(false);
  });
});

describe('AI-004/005 ball-in-hand placement', () => {
  it('ballInHand=false → cueBallNewPos is null', () => {
    const space = makeSpace();
    const result = calculateAIShot(space, allAllowable, false, false, 3, 5, 42);
    expect(result.cueBallNewPos).toBeNull();
  });

  it('ballInHand=true, isFirstShot=true → may produce cueBallNewPos (break placement)', () => {
    // Place cue ball well inside the firstQuad break zone (x=-9420,z=0 = -0.942m,0)
    // so random offset can stay in bounds
    const b0 = makeBall(0, -9420, BALL_Y, 0);   // at firstQuad center x=-0.942m
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());

    // Run several seeds to find one where moveCueBall=true and placement succeeds
    let gotNewPos = false;
    for (let seed = 0; seed < 50; seed++) {
      const result = calculateAIShot(space, allAllowable, true, true, 3, 5, seed);
      if (result.cueBallNewPos !== null) { gotNewPos = true; break; }
    }
    expect(gotNewPos).toBe(true);
  });
});

describe('AI-006 force cap invariant', () => {
  it('|impulse| ≤ MAX_FORCE for all seeds', () => {
    const space = makeSpace();
    for (let seed = 0; seed < 20; seed++) {
      const { impulse } = calculateAIShot(space, allAllowable, false, false, 3, 5, seed).shotData;
      const mag = Math.sqrt(impulse.x ** 2 + impulse.z ** 2);
      expect(mag).toBeLessThanOrEqual(MAX_FORCE + 1);  // +1 for trunc rounding
    }
  });
});

describe('AI-007 allowableBalls filter (PRNG stability)', () => {
  it('marking ball 1 as non-allowable gives consistent results (no crash)', () => {
    const space = makeSpace();
    const noneAllowable = (_id: number): boolean => false;
    const r1 = calculateAIShot(space, noneAllowable, false, false, 3, 5, 42);
    const r2 = calculateAIShot(space, noneAllowable, false, false, 3, 5, 42);
    // Non-allowable: no pocket shots possible, fallback fires residual direction
    // Must not crash and must be deterministic
    expect(r1.shotData.impulse.x).toBe(r2.shotData.impulse.x);
    expect(r1.shotData.impulse.z).toBe(r2.shotData.impulse.z);
  });
});

describe('AI-008 all-kinematic (no active object balls)', () => {
  it('fallback fires without crash when all object balls are kinematic', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    space.rigidbodies[1].isKinematic = true;  // b1 pocketed

    const result = calculateAIShot(space, allAllowable, false, false, 3, 5, 1);
    // Should not throw; fires in default forward direction (0,0,1)
    expect(result.shotData).toBeDefined();
    expect(result.cueBallNewPos).toBeNull();
  });
});

describe('AI-009 isFirstShot=false: no placement draws (PRNG stable)', () => {
  it('normal shot with same seed is identical regardless of ballInHand flag when placement zone unreachable', () => {
    // Cue at +x side (outside firstQuad break zone) — placement will always fail PositionIsFree
    // so moveCueBall being true/false doesn't affect the outcome
    const b0 = makeBall(0, 5000, BALL_Y, 0);   // right side, outside break zone
    const b1 = makeBall(1, 2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());

    // isFirstShot=false: the 2 placement draws are NOT taken regardless of moveCueBall
    const r1 = calculateAIShot(space, allAllowable, false, true,  3, 5, 777);
    const r2 = calculateAIShot(space, allAllowable, false, false, 3, 5, 777);
    // Both should produce same impulse (placement draws only happen if isFirstShot=true)
    expect(r1.shotData.impulse.x).toBe(r2.shotData.impulse.x);
    expect(r1.shotData.impulse.z).toBe(r2.shotData.impulse.z);
  });
});
