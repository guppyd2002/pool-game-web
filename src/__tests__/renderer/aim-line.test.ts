/**
 * P1-T02: aim-line pure function tests.
 *
 * Covers toWorld() and computeAimLinePoints() — the testable, DOM-free core
 * of the aim line visual. Three.js wrapper is browser-only and not tested here.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CmVector } from '../../physics/cm-vector';
import type { AimHit } from '../../game/ball-pool-physics';
import { toWorld, computeAimLinePoints } from '../../renderer/aim-line';
import { MULTIPLIER } from '../../physics/fixed-math';
import { BALL_Y } from '../../physics/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CUE_POS = new CmVector(0, BALL_Y, 0);  // ball at table centre

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

// ─── toWorld ─────────────────────────────────────────────────────────────────

describe('toWorld — Fixed CmVector → THREE.Vector3 float', () => {
  it('converts (10000,0,0) → (1,0,0)', () => {
    const v = toWorld(new CmVector(MULTIPLIER, 0, 0));
    expect(v.x).toBeCloseTo(1, 10);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('converts (0,9440,0) → (0, 0.944, 0)  (BALL_Y)', () => {
    const v = toWorld(new CmVector(0, BALL_Y, 0));
    expect(v.x).toBe(0);
    expect(v.y).toBeCloseTo(BALL_Y / MULTIPLIER, 10);
    expect(v.z).toBe(0);
  });

  it('converts negative components', () => {
    const v = toWorld(new CmVector(-5000, 0, -3000));
    expect(v.x).toBeCloseTo(-0.5, 10);
    expect(v.z).toBeCloseTo(-0.3, 10);
  });

  it('CmVector.zero → THREE.Vector3(0,0,0)', () => {
    const v = toWorld(CmVector.zero);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('result is a THREE.Vector3 instance', () => {
    expect(toWorld(CmVector.zero)).toBeInstanceOf(THREE.Vector3);
  });
});

// ─── computeAimLinePoints — 'none' ────────────────────────────────────────────

describe("computeAimLinePoints — hitType 'none'", () => {
  it("returns 2 points", () => {
    const hit = makeHit('none', 120000, BALL_Y, 0);
    expect(computeAimLinePoints(CUE_POS, hit)).toHaveLength(2);
  });

  it('first point is cue ball world position', () => {
    const hit = makeHit('none', 120000, BALL_Y, 0);
    const pts = computeAimLinePoints(CUE_POS, hit);
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[0].z).toBeCloseTo(0, 6);
  });

  it('second point is hit.point converted to world', () => {
    const hit = makeHit('none', 120000, BALL_Y, 0);
    const pts = computeAimLinePoints(CUE_POS, hit);
    expect(pts[1].x).toBeCloseTo(12, 6);  // 120000 / 10000
    expect(pts[1].z).toBeCloseTo(0, 6);
  });
});

// ─── computeAimLinePoints — 'ball' ────────────────────────────────────────────

describe("computeAimLinePoints — hitType 'ball'", () => {
  it('returns exactly 2 points (no reflection for ball hit)', () => {
    const hit = makeHit('ball', 50000, BALL_Y, 0);
    expect(computeAimLinePoints(CUE_POS, hit)).toHaveLength(2);
  });

  it('line goes from cue ball to hit ball contact point', () => {
    const hit = makeHit('ball', 50000, BALL_Y, 0);
    const pts = computeAimLinePoints(CUE_POS, hit);
    expect(pts[0].x).toBeCloseTo(0, 6);
    expect(pts[1].x).toBeCloseTo(5, 6);  // 50000 / 10000
  });
});

// ─── computeAimLinePoints — 'cushion' ─────────────────────────────────────────

describe("computeAimLinePoints — hitType 'cushion'", () => {
  it('returns 3 points when normal is non-zero', () => {
    // Hit right rail (x = +RAIL_LONG_X), normal points inward (-x)
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    expect(computeAimLinePoints(CUE_POS, hit)).toHaveLength(3);
  });

  it('returns 2 points when normal is zero (degenerate)', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, 0, 0, 0);
    expect(computeAimLinePoints(CUE_POS, hit)).toHaveLength(2);
  });

  it('perpendicular hit on right rail: ball bounces back (-x direction)', () => {
    // Ball at origin shot toward +x, hits right rail, normal = (-1,0,0)
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 1.0);
    // bounce point should be to the LEFT of hit point (x < hit.x)
    expect(pts[2].x).toBeLessThan(pts[1].x);
    expect(pts[2].z).toBeCloseTo(pts[1].z, 3);  // z unchanged for perp hit
  });

  it('diagonal hit on right rail: bounce goes toward -x and preserves z component', () => {
    // Ball shot toward (+x, 0, +z), hits right rail, normal = (-1,0,0)
    const hit = makeHit('cushion', 126990, BALL_Y, 63495, -MULTIPLIER, 0, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 2.0);
    // After reflection off right wall: x reverses, z component unchanged
    const bounceDir = pts[2].clone().sub(pts[1]).normalize();
    expect(bounceDir.x).toBeLessThan(0);   // bounces back in -x
    expect(bounceDir.z).toBeGreaterThan(0); // z preserved
  });

  it('bounceLength controls the length of the reflection segment', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const pts05 = computeAimLinePoints(CUE_POS, hit, 0.5);
    const pts10 = computeAimLinePoints(CUE_POS, hit, 1.0);
    const len05 = pts05[2].distanceTo(pts05[1]);
    const len10 = pts10[2].distanceTo(pts10[1]);
    expect(len10).toBeCloseTo(len05 * 2, 4);
  });

  it('default bounceLength (0.5) produces bounce segment ~0.5 world units long', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    const pts = computeAimLinePoints(CUE_POS, hit);  // default bounceLength=0.5
    const len = pts[2].distanceTo(pts[1]);
    expect(len).toBeCloseTo(0.5, 4);
  });

  it('angle of incidence equals angle of reflection', () => {
    // ~27° diagonal shot (px=12.699, pz=6.3495), right-rail normal = (-1,0,0)
    const hit = makeHit('cushion', 126990, BALL_Y, 63495, -MULTIPLIER, 0, 0);
    const pts = computeAimLinePoints(CUE_POS, hit, 1.0);
    const norm = new THREE.Vector3(-1, 0, 0);
    const inc = pts[1].clone().sub(pts[0]).normalize();
    const ref = pts[2].clone().sub(pts[1]).normalize();
    const angInc = Math.acos(Math.abs(inc.dot(norm)));
    const angRef = Math.acos(Math.abs(ref.dot(norm)));
    expect(angInc).toBeCloseTo(angRef, 4);
  });
});

// ─── computeAimLinePoints — all Three.Vector3 instances ────────────────────────

describe('computeAimLinePoints — result types', () => {
  it('all points are THREE.Vector3 instances', () => {
    const hit = makeHit('cushion', 126990, BALL_Y, 0, -MULTIPLIER, 0, 0);
    for (const pt of computeAimLinePoints(CUE_POS, hit)) {
      expect(pt).toBeInstanceOf(THREE.Vector3);
    }
  });
});
