/**
 * Tests for CmSpace (physical space controller) and CmState (serialization).
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider } from '../../physics/colliders';
import { CmRigidbody, CmForceMode, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import { CmRigidbodyState, CmSpaceState } from '../../physics/cm-state';
import { CmSpaceCube } from '../../physics/cm-collision';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultMaterial = {
  bounciness: 9000,
  rollingFriction: 1000,
  twistingFriction: 1000,
  dynamicFriction: 2000,
  staticFriction: 5000,
};

function makeBody(id: number, pos: CmVector, radius: number, mass: number): CmRigidbody {
  const collider = new CmSphereCollider();
  collider.id = id;
  collider.position = pos;
  collider.radius = radius;
  collider.enabled = true;
  collider.scale = new CmVector(radius, radius, radius);
  collider.material = { ...defaultMaterial };
  const body = new CmRigidbody();
  body.id = id;
  body.mass = mass;
  body.collider = collider;
  body.centreOfMass = CmVector.zero;
  return body;
}

function makePlane(id: number, pos: CmVector, up: CmVector): CmPlaneCollider {
  const p = new CmPlaneCollider();
  p.id = id;
  p.position = pos;
  p.up = up;
  p.right = new CmVector(MULTIPLIER, 0, 0);
  p.forward = new CmVector(0, 0, MULTIPLIER);
  p.scale = new CmVector(200000, 0, 200000);
  p.radius = 100000;
  p.enabled = true;
  p.material = { ...defaultMaterial };
  return p;
}

function makeSpace(bodies: CmRigidbody[], colliders: CmPlaneCollider[]): CmSpace {
  const space = new CmSpace();
  const cube: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(500000, 500000, 500000),
  };
  space.init(cube, bodies, colliders, []);
  return space;
}

// ─── Full simulation test ────────────────────────────────────────────────────

describe('CmSpace full simulation', () => {
  it('two balls: one moving, one stationary → both settle to inactive', () => {
    // Ball 0 at origin moving right, Ball 1 stationary to the right
    const b0 = makeBody(0, new CmVector(0, 5000, 0), 2850, MULTIPLIER);
    const b1 = makeBody(1, new CmVector(20000, 5000, 0), 2850, MULTIPLIER);
    // Plane below
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));

    const space = makeSpace([b0, b1], [plane]);
    b0.velocity = new CmVector(30000, 0, 0);
    b0.isActive = true;

    let steps = 0;
    const maxSteps = 10000;
    while (space.isActive && steps < maxSteps) {
      space.calculate(null, false);
      steps++;
    }

    // Both balls should have settled
    expect(space.isActive).toBe(false);
    expect(b0.isActive).toBe(false);
    expect(b1.isActive).toBe(false);
    // Should converge in reasonable steps
    expect(steps).toBeLessThan(maxSteps);
  });
});

// ─── Adaptive timestep ───────────────────────────────────────────────────────

describe('CmSpace adaptive timestep', () => {
  it('very high-speed ball → timestep ≤ 100 (with 2 bodies)', () => {
    // Need 2 bodies for adaptive timestep to kick in
    // radius/velocity/precision must give ts < 100:
    // ts = clamp(fixDiv(radius, magnitude) / precision, 50, 200)
    // radius=2850, vel=200000 → magnitude≈200000, fixDiv(2850,200000)=142, /2=71 → clamp=71 ≤ 100 ✓
    const b0 = makeBody(0, new CmVector(0, 2850, 0), 2850, MULTIPLIER);
    const b1 = makeBody(1, new CmVector(500000, 2850, 0), 2850, MULTIPLIER);
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
    const space = makeSpace([b0, b1], [plane]);
    b0.velocity = new CmVector(200000, 0, 0);
    b1.velocity = new CmVector(200000, 0, 0);

    space.calculate(null, false);
    expect(space.timestep).toBeLessThanOrEqual(100);
  });

  it('stationary ball → timestep = maxTS (200)', () => {
    const b0 = makeBody(0, new CmVector(0, 5000, 0), 2850, MULTIPLIER);
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
    const space = makeSpace([b0], [plane]);
    b0.velocity = CmVector.zero;
    b0.isActive = true;

    space.calculate(null, false);
    expect(space.timestep).toBe(200);
  });
});

// ─── Spatial partitioning ────────────────────────────────────────────────────

describe('CmSpace spatial partitioning', () => {
  it('two balls in same grid cell → collision occurs', () => {
    // Both balls very close
    const b0 = makeBody(0, new CmVector(0, 5000, 0), 2850, MULTIPLIER);
    const b1 = makeBody(1, new CmVector(4000, 5000, 0), 2850, MULTIPLIER);
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
    const space = makeSpace([b0, b1], [plane]);
    b0.velocity = new CmVector(10000, 0, 0);
    b0.isActive = true;

    space.calculate(null, false);
    // Ball 1 should become active from collision
    expect(b1.isActive).toBe(true);
  });

  it('two balls far apart → no collision in single step', () => {
    const b0 = makeBody(0, new CmVector(0, 5000, 0), 2850, MULTIPLIER);
    const b1 = makeBody(1, new CmVector(200000, 5000, 0), 2850, MULTIPLIER);
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
    const space = makeSpace([b0, b1], [plane]);
    b0.velocity = new CmVector(10000, 0, 0);
    b0.isActive = true;
    b1.isActive = false;

    space.calculate(null, false);
    // Ball 1 should still be inactive (too far)
    expect(b1.isActive).toBe(false);
  });
});

// ─── State serialization round-trip ──────────────────────────────────────────

describe('CmState serialization', () => {
  it('CmRigidbodyState round-trip', () => {
    const s = new CmRigidbodyState();
    s.isActive = true;
    s.isKinematic = false;
    s.isOutOfCube = false;
    s.kinematicTriggerId = 3;
    s.position = new CmVector(12345, -6789, 42);
    s.right = new CmVector(MULTIPLIER, 0, 0);
    s.up = new CmVector(0, MULTIPLIER, 0);
    s.forward = new CmVector(0, 0, MULTIPLIER);
    s.velocity = new CmVector(5000, -3000, 0);
    s.angularVelocity = new CmVector(100, 200, 300);
    s.firstHitDirection = CmVector.zero;

    const str = s.toStringState();
    const parsed = CmRigidbodyState.fromString(str);

    expect(parsed.isActive).toBe(true);
    expect(parsed.isKinematic).toBe(false);
    expect(parsed.kinematicTriggerId).toBe(3);
    expect(parsed.position.x).toBe(12345);
    expect(parsed.position.y).toBe(-6789);
    expect(parsed.velocity.x).toBe(5000);
    expect(parsed.firstHitDirection.x).toBe(0);
  });

  it('CmSpaceState getStringState → setStateFromString round-trip', () => {
    const b0 = makeBody(0, new CmVector(1000, 5000, -2000), 2850, MULTIPLIER);
    const b1 = makeBody(1, new CmVector(20000, 5000, 0), 2850, MULTIPLIER);
    const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
    const space = makeSpace([b0, b1], [plane]);
    b0.velocity = new CmVector(10000, 0, 0);

    const stateStr = space.getStringState();
    // Modify state
    b0.velocity = new CmVector(99999, 0, 0);
    b0.collider.position = new CmVector(88888, 0, 0);

    // Restore
    space.setStateFromString(stateStr, null);

    // Should be back to original
    const stateStr2 = space.getStringState();
    expect(stateStr2).toBe(stateStr);
  });
});

// ─── Property test: convergence ──────────────────────────────────────────────

describe('CmSpace property tests', () => {
  it('any initial x-velocity → converges to inactive within 15000 steps', () => {
    const velArb = fc.integer({ min: -50000, max: 50000 });
    fc.assert(fc.property(velArb, (vx) => {
      const b0 = makeBody(0, new CmVector(0, 2850, 0), 2850, MULTIPLIER);
      // Lower bounciness (0.5) for faster convergence in property tests
      b0.collider.material = {
        bounciness: 5000, rollingFriction: 2000, twistingFriction: 2000,
        dynamicFriction: 3000, staticFriction: 5000,
      };
      const plane = makePlane(0, CmVector.zero, new CmVector(0, MULTIPLIER, 0));
      plane.material = { ...b0.collider.material };
      const space = makeSpace([b0], [plane]);
      b0.velocity = new CmVector(vx, 0, 0);
      b0.isActive = true;

      let steps = 0;
      while (space.isActive && steps < 15000) {
        space.calculate(null, false);
        steps++;
      }
      expect(space.isActive).toBe(false);
    }), { numRuns: 30 });
  });
});
