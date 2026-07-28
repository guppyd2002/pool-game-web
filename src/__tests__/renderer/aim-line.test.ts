/**
 * P1-T02 / SP-Harden-9: aim-line pure function tests.
 * Cue aim guide (blue line) length is guideLength along aim dir for ALL hitTypes.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CmVector } from '../../physics/cm-vector';
import type { AimHit } from '../../game/ball-pool-physics';
import {
  toWorld,
  computeAimLinePoints,
  setCueAimGuideLengthM,
  getCueAimGuideLengthM,
  DEFAULT_CUE_AIM_GUIDE_LENGTH_M,
} from '../../renderer/aim-line';
import { MULTIPLIER } from '../../physics/fixed-math';
import { BALL_Y } from '../../physics/constants';

const CUE_POS = new CmVector(0, BALL_Y, 0);

function makeHit(
  hitType: AimHit['hitType'],
  px: number, py: number, pz: number,
  nx = 0, ny = 0, nz = 0,
): AimHit {
  return {
    hitType,
    ballId: hitType === 'ball' ? 1 : null,
    cushionId: hitType === 'cushion' ? 0 : null,
    point: new CmVector(px, py, pz),
    normal: new CmVector(nx, ny, nz),
    distance: Math.trunc(Math.sqrt(px * px + pz * pz)),
  };
}

describe('toWorld — Fixed CmVector → THREE.Vector3 float', () => {
  it('converts (10000,0,0) → (1,0,0)', () => {
    const v = toWorld(new CmVector(MULTIPLIER, 0, 0));
    expect(v.x).toBeCloseTo(1, 10);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });
});

describe('computeAimLinePoints — guideLength for ALL hitTypes (CATCH-1)', () => {
  it('none: end is guideLength along aim dir, not locked to hit.point', () => {
    const hit = makeHit('none', 120000, BALL_Y, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 1.5);
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[1].x).toBeCloseTo(1.5, 4);
  });

  it('ball: guideLength extends past ghost/contact', () => {
    const R = 285 / MULTIPLIER;
    const hit = makeHit(
      'ball',
      Math.round((0.5 - R) * MULTIPLIER), BALL_Y, 0,
      -MULTIPLIER, 0, 0,
    );
    const pts = computeAimLinePoints(CUE_POS, hit, 2.0);
    expect(pts).toHaveLength(2);
    expect(pts[1].x).toBeCloseTo(2.0, 4);
  });

  it('cushion: ALSO uses guideLength (not contact-locked) — empty-felt aim DOA fix', () => {
    // Enclosed table empty-felt aim → SphereCast hits cushion. Slider must work here.
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const short = computeAimLinePoints(CUE_POS, hit, 0.5);
    const long = computeAimLinePoints(CUE_POS, hit, 2.0);
    expect(short).toHaveLength(2);
    expect(long).toHaveLength(2);
    // Contact is at ~1.27 m; guide must NOT be locked to contact for either length.
    expect(short[1].x).toBeCloseTo(0.5, 4);
    expect(long[1].x).toBeCloseTo(2.0, 4);
    expect(long[1].x).toBeGreaterThan(short[1].x);
  });

  it('cushion and ball with same aim dir and guideLength share end length', () => {
    const ball = makeHit('ball', 50000, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const cush = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const b = computeAimLinePoints(CUE_POS, ball, 1.2);
    const c = computeAimLinePoints(CUE_POS, cush, 1.2);
    const lenB = b[0].distanceTo(b[1]);
    const lenC = c[0].distanceTo(c[1]);
    expect(lenB).toBeCloseTo(1.2, 4);
    expect(lenC).toBeCloseTo(1.2, 4);
  });
});

describe('setCueAimGuideLengthM', () => {
  it('clamps to 0.10–3.00 and get returns applied', () => {
    expect(setCueAimGuideLengthM(0.01)).toBeCloseTo(0.1, 6);
    expect(getCueAimGuideLengthM()).toBeCloseTo(0.1, 6);
    expect(setCueAimGuideLengthM(9)).toBeCloseTo(3.0, 6);
    expect(setCueAimGuideLengthM(DEFAULT_CUE_AIM_GUIDE_LENGTH_M)).toBeCloseTo(
      DEFAULT_CUE_AIM_GUIDE_LENGTH_M, 6,
    );
  });
});

describe('computeAimLinePoints — result types', () => {
  it('all points are THREE.Vector3 instances', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    for (const pt of computeAimLinePoints(CUE_POS, hit, 1.0)) {
      expect(pt).toBeInstanceOf(THREE.Vector3);
    }
  });
});
