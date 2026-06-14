/**
 * Tests for colliders — CmSphereCollider, CmPlaneCollider, CmLineCollider, CmCollisionManager.
 * TDD red phase: defines expected collision behavior.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import {
  CmSphereCollider,
  CmPlaneCollider,
  CmLineCollider,
  CmHitInfo,
  CmMaterial,
} from '../../physics/colliders';
import { CmCollisionManager } from '../../physics/cm-collision';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a sphere collider at position with given radius */
function makeSphere(pos: CmVector, radius: number): CmSphereCollider {
  const s = new CmSphereCollider();
  s.position = pos;
  s.radius = radius;
  s.enabled = true;
  s.scale = new CmVector(radius, radius, radius);
  s.right = new CmVector(MULTIPLIER, 0, 0);
  s.up = new CmVector(0, MULTIPLIER, 0);
  s.forward = new CmVector(0, 0, MULTIPLIER);
  return s;
}

/** Create a plane collider at position with given up normal */
function makePlane(pos: CmVector, up: CmVector): CmPlaneCollider {
  const p = new CmPlaneCollider();
  p.position = pos;
  p.up = up;
  p.right = new CmVector(MULTIPLIER, 0, 0);
  p.forward = new CmVector(0, 0, MULTIPLIER);
  p.scale = new CmVector(100000, 0, 100000);
  p.radius = 50000;
  p.enabled = true;
  return p;
}

/** Create a line collider along right axis at position */
function makeLine(pos: CmVector, right: CmVector, scaleX: number): CmLineCollider {
  const l = new CmLineCollider();
  l.position = pos;
  l.right = right;
  l.up = new CmVector(0, MULTIPLIER, 0);
  l.forward = new CmVector(0, 0, MULTIPLIER);
  l.scale = new CmVector(scaleX, 0, 0);
  l.radius = Math.trunc(scaleX / 2);
  l.enabled = true;
  return l;
}

// ─── Sphere-Sphere ───────────────────────────────────────────────────────────

describe('Sphere-Sphere collision', () => {
  it('distance < 2R → isHit=true, normal points from B to A', () => {
    // Two spheres with radius 5000, centers 8000 apart (< 10000)
    const a = makeSphere(new CmVector(0, 0, 0), 5000);
    const b = makeSphere(new CmVector(8000, 0, 0), 5000);
    const result = a.isHit(b);
    expect(result.hit).toBe(true);
    // Normal should point from B to A (negative x direction normalized)
    expect(result.hitInfo.normal.x).toBeLessThan(0);
  });

  it('distance > 2R → isHit=false', () => {
    const a = makeSphere(new CmVector(0, 0, 0), 5000);
    const b = makeSphere(new CmVector(20000, 0, 0), 5000);
    const result = a.isHit(b);
    expect(result.hit).toBe(false);
  });

  it('distance === 2R (touching) → isHit=true', () => {
    // radius=5000 each, distance=10000 → sqrDist=10000, powSave(10000)=10000
    // Actually: sqrDist = (10000²+0+0)/10000 = 10000, powSave(5000+5000)=powSave(10000)=10000*10000/10000=10000
    const a = makeSphere(new CmVector(0, 0, 0), 5000);
    const b = makeSphere(new CmVector(10000, 0, 0), 5000);
    const result = a.isHit(b);
    // sqrDistance = 10000, pow(r1+r2) = pow(10000) = 10000
    // 10000 <= 10000 → true
    expect(result.hit).toBe(true);
  });
});

// ─── Sphere-Plane ────────────────────────────────────────────────────────────

describe('Sphere-Plane collision', () => {
  it('sphere above plane within radius → isHit=true, normal = plane up', () => {
    // Plane at y=0, sphere at y=3000 with radius=5000
    const sphere = makeSphere(new CmVector(0, 3000, 0), 5000);
    const plane = makePlane(new CmVector(0, 0, 0), new CmVector(0, MULTIPLIER, 0));
    const result = sphere.isHit(plane);
    expect(result.hit).toBe(true);
    expect(result.hitInfo.normal.y).toBeGreaterThan(0);
  });

  it('sphere far above plane → isHit=false', () => {
    // Plane at y=0, sphere at y=20000 with radius=5000
    const sphere = makeSphere(new CmVector(0, 20000, 0), 5000);
    const plane = makePlane(new CmVector(0, 0, 0), new CmVector(0, MULTIPLIER, 0));
    const result = sphere.isHit(plane);
    expect(result.hit).toBe(false);
  });
});

// ─── Sphere-Line ─────────────────────────────────────────────────────────────

describe('Sphere-Line collision', () => {
  it('sphere close to line → isHit=true', () => {
    // Line along X axis at origin, length 20000
    const line = makeLine(new CmVector(0, 0, 0), new CmVector(MULTIPLIER, 0, 0), 20000);
    // Sphere at (5000, 3000, 0) with radius 5000 — distance to axis = 3000, < radius
    const sphere = makeSphere(new CmVector(5000, 3000, 0), 5000);
    const result = sphere.isHit(line);
    expect(result.hit).toBe(true);
  });

  it('sphere far from line → isHit=false', () => {
    const line = makeLine(new CmVector(0, 0, 0), new CmVector(MULTIPLIER, 0, 0), 20000);
    // Sphere at (5000, 30000, 0) with radius 5000 — distance to axis = 30000, > radius
    const sphere = makeSphere(new CmVector(5000, 30000, 0), 5000);
    const result = sphere.isHit(line);
    expect(result.hit).toBe(false);
  });
});

// ─── CmCollisionManager ─────────────────────────────────────────────────────

describe('CmCollisionManager', () => {
  describe('sphereIsHitSubspace', () => {
    it('sphere within subspace → true', () => {
      // Centre at (0,0,0), radiusPow = 5000*5000/10000 = 2500, halfScale=3000, position at (2000,0,0)
      // x = max(|0-2000|-3000, 0) = max(-1000, 0) = 0 → sqrMag=0 < 2500 → true
      expect(CmCollisionManager.sphereIsHitSubspace(
        new CmVector(0, 0, 0), 2500, 3000, new CmVector(2000, 0, 0),
      )).toBe(true);
    });

    it('sphere outside subspace → false', () => {
      // Centre at (0,0,0), radiusPow = 2500, halfScale=1000, position at (10000,0,0)
      // x = max(|0-10000|-1000, 0) = 9000 → sqrMag = 9000²/10000 = 8100 > 2500 → false
      expect(CmCollisionManager.sphereIsHitSubspace(
        new CmVector(0, 0, 0), 2500, 1000, new CmVector(10000, 0, 0),
      )).toBe(false);
    });
  });
});

// ─── Property tests ──────────────────────────────────────────────────────────

describe('Collider property tests', () => {
  it('isHit(sphereA, sphereB) === isHit(sphereB, sphereA) (symmetry)', () => {
    const posArb = fc.tuple(
      fc.integer({ min: -50000, max: 50000 }),
      fc.integer({ min: -50000, max: 50000 }),
      fc.integer({ min: -50000, max: 50000 }),
    ).map(([x, y, z]) => new CmVector(x, y, z));
    const radiusArb = fc.integer({ min: 1000, max: 10000 });

    fc.assert(fc.property(posArb, posArb, radiusArb, radiusArb, (p1, p2, r1, r2) => {
      const a = makeSphere(p1, r1);
      const b = makeSphere(p2, r2);
      expect(a.isHit(b).hit).toBe(b.isHit(a).hit);
    }), { numRuns: 1000 });
  });

  it('hit normal magnitude ≈ 10000 (when positions differ significantly)', () => {
    // Use positions far enough apart that normalization is precise
    // Integer sqrt has up to ~5% error at small magnitudes, so we require sqrMag >= 10000
    // (i.e. actual distance >= 1.0 in fixed-point) and accept ±200 tolerance
    const posArb = fc.tuple(
      fc.integer({ min: -10000, max: 10000 }),
      fc.integer({ min: -10000, max: 10000 }),
      fc.integer({ min: -10000, max: 10000 }),
    ).map(([x, y, z]) => new CmVector(x, y, z));

    fc.assert(fc.property(posArb, posArb, (p1, p2) => {
      const a = makeSphere(p1, 15000);
      const b = makeSphere(p2, 15000);
      const result = a.isHit(b);
      const diff = new CmVector(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
      // Only verify when distance is large enough for integer sqrt precision
      if (result.hit && diff.sqrMagnitude >= 10000) {
        expect(Math.abs(result.hitInfo.normal.magnitude - MULTIPLIER)).toBeLessThanOrEqual(200);
      }
    }), { numRuns: 1000 });
  });

  it('isHitSubspace true for sphere at center of subspace', () => {
    const radiusArb = fc.integer({ min: 1000, max: 20000 });
    fc.assert(fc.property(radiusArb, (r) => {
      const pos = new CmVector(0, 0, 0);
      const radiusPow = Math.trunc((r * r) / MULTIPLIER);
      // halfScale = r, position = center → distance = 0 < radiusPow → true
      expect(CmCollisionManager.sphereIsHitSubspace(pos, radiusPow, r, pos)).toBe(true);
    }), { numRuns: 1000 });
  });
});
