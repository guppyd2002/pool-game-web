/**
 * Cue aim guide (blue line): CEO bake — always cue → ghost/contact (not extendable).
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
import { ghostCenter } from '../../renderer/ghost-ball';
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

describe('computeAimLinePoints — CEO bake: cue → ghost/contact only', () => {
  it('ball: end is ghost center (not past contact, ignores guideLength)', () => {
    const R = 285 / MULTIPLIER;
    const hit = makeHit(
      'ball',
      Math.round((0.5 - R) * MULTIPLIER), BALL_Y, 0,
      -MULTIPLIER, 0, 0,
    );
    const g = ghostCenter(hit);
    const short = computeAimLinePoints(CUE_POS, hit, 0.5);
    const long = computeAimLinePoints(CUE_POS, hit, 3.0);
    expect(short).toHaveLength(2);
    expect(short[1].x).toBeCloseTo(g.x, 5);
    expect(short[1].z).toBeCloseTo(g.z, 5);
    // guideLength ignored
    expect(long[1].x).toBeCloseTo(short[1].x, 5);
  });

  it('cushion: end is contact point (not extendable)', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 2.0);
    expect(pts).toHaveLength(2);
    expect(pts[1].x).toBeCloseTo(126990 / MULTIPLIER, 4);
  });

  it('none: end is hit.point', () => {
    const hit = makeHit('none', 50000, BALL_Y, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 1.5);
    expect(pts[1].x).toBeCloseTo(5.0, 4);
  });
});

describe('setCueAimGuideLengthM', () => {
  it('clamps still work (API retained; geometry ignores value)', () => {
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
