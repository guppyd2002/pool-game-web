/**
 * Tests for CmRigidbody — core physics simulation.
 * TDD red phase.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MULTIPLIER, fixMul, fixPowSave } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider } from '../../physics/colliders';
import {
  CmRigidbody,
  CmForceMode,
  CmKinematicTrigger,
  CmSpaceCube,
} from '../../physics/cm-rigidbody';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a rigidbody with sphere collider at position */
function makeBody(pos: CmVector, radius: number, mass: number): CmRigidbody {
  const collider = new CmSphereCollider();
  collider.position = pos;
  collider.radius = radius;
  collider.enabled = true;
  collider.scale = new CmVector(radius, radius, radius);
  collider.material = {
    bounciness: 10000,
    rollingFriction: 1000,
    twistingFriction: 1000,
    dynamicFriction: 2000,
    staticFriction: 5000,
  };
  const body = new CmRigidbody();
  body.mass = mass;
  body.collider = collider;
  body.centreOfMass = CmVector.zero;
  body.init();
  return body;
}

// ─── AddImpulse ──────────────────────────────────────────────────────────────

describe('CmRigidbody AddImpulse', () => {
  it('Impulse mode, mass=10000: force=(10000,0,0) → velocity += (10000,0,0)', () => {
    const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
    body.addImpulse(new CmVector(10000, 0, 0), body.collider.position, CmForceMode.Impulse);
    // divide(force, mass) = (10000*10000)/10000 = 10000
    expect(body.velocity.x).toBe(10000);
    expect(body.velocity.y).toBe(0);
    expect(body.velocity.z).toBe(0);
  });

  it('Impulse mode, mass=20000: force=(10000,0,0) → velocity += (5000,0,0)', () => {
    const body = makeBody(CmVector.zero, 5000, 20000);
    body.addImpulse(new CmVector(10000, 0, 0), body.collider.position, CmForceMode.Impulse);
    // divide(force, mass) = (10000*10000)/20000 = 5000
    expect(body.velocity.x).toBe(5000);
  });

  it('Impulse with offset generates torque (angularVelocity changes)', () => {
    const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
    // Apply force at an offset point
    const offsetPoint = new CmVector(0, 5000, 0);
    body.addImpulse(new CmVector(10000, 0, 0), offsetPoint, CmForceMode.Impulse);
    // Angular velocity should be non-zero
    const av = body.angularVelocity;
    expect(av.x !== 0 || av.y !== 0 || av.z !== 0).toBe(true);
  });

  it('AddImpulse(zero) → velocity unchanged', () => {
    const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
    body.velocity = new CmVector(5000, 0, 0);
    body.addImpulse(CmVector.zero, body.collider.position, CmForceMode.Impulse);
    expect(body.velocity.x).toBe(5000);
  });
});

// ─── moveAndCheckIsActive ────────────────────────────────────────────────────

describe('CmRigidbody moveAndCheckIsActive', () => {
  it('no collisions → applies gravity', () => {
    const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
    body.velocity = new CmVector(10000, 0, 0);
    const timestep = 100; // 0.01 in fixed
    body.moveAndCheckIsActive(timestep);
    // gravity = (0, -98100, 0), multiply by timestep: (0, -98100*100/10000, 0) = (0, -981, 0)
    expect(body.velocity.x).toBe(10000);
    expect(body.velocity.y).toBe(-981);
  });

  it('velocity below threshold for cCount frames → deactivates', () => {
    const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
    body.velocity = new CmVector(1, 0, 0); // sqrMag = 0 (< 100)
    body.angularVelocity = CmVector.zero;
    // Simulate having hit a collider (to trigger CheckIsActive)
    body.hitColliders.push(999);

    body.moveAndCheckIsActive(100);
    expect(body.isActive).toBe(true); // checkCount=1, need cCount=2
    body.moveAndCheckIsActive(100);
    expect(body.isActive).toBe(true); // checkCount=2, need > cCount
    body.moveAndCheckIsActive(100);
    expect(body.isActive).toBe(false); // checkCount > 2 → deactivated
  });
});

// ─── calculateHitBody ────────────────────────────────────────────────────────

describe('CmRigidbody calculateHitBody', () => {
  it('head-on collision: momentum conserved (±2)', () => {
    // Ball A moving right, Ball B stationary, equal mass, overlapping
    const a = makeBody(new CmVector(0, 0, 0), 5000, MULTIPLIER);
    const b = makeBody(new CmVector(8000, 0, 0), 5000, MULTIPLIER);
    a.velocity = new CmVector(10000, 0, 0);
    b.velocity = CmVector.zero;
    a.firstHitDirection = CmVector.zero;
    b.firstHitDirection = CmVector.zero;

    const momentumBefore = a.velocity.x * a.mass + b.velocity.x * b.mass;

    a.calculateHitBody(100, b, () => {}, () => {});

    const momentumAfter = a.velocity.x * a.mass + b.velocity.x * b.mass;
    // Momentum conserved (within integer rounding)
    expect(Math.abs(momentumBefore - momentumAfter)).toBeLessThanOrEqual(2 * MULTIPLIER);
  });

  it('body2 becomes active after hit', () => {
    const a = makeBody(new CmVector(0, 0, 0), 5000, MULTIPLIER);
    const b = makeBody(new CmVector(8000, 0, 0), 5000, MULTIPLIER);
    a.velocity = new CmVector(10000, 0, 0);
    b.velocity = CmVector.zero;
    b.isActive = false;

    a.calculateHitBody(100, b, () => {}, () => {});

    expect(b.isActive).toBe(true);
  });
});

// ─── calculateHitCollider (Plane) ────────────────────────────────────────────

describe('CmRigidbody calculateHitCollider (Plane)', () => {
  it('ball hitting plane → velocity reflects with bounciness', () => {
    const body = makeBody(new CmVector(0, 4000, 0), 5000, MULTIPLIER);
    body.velocity = new CmVector(0, -10000, 0);

    const plane = new CmPlaneCollider();
    plane.position = CmVector.zero;
    plane.up = new CmVector(0, MULTIPLIER, 0);
    plane.right = new CmVector(MULTIPLIER, 0, 0);
    plane.forward = new CmVector(0, 0, MULTIPLIER);
    plane.scale = new CmVector(100000, 0, 100000);
    plane.radius = 50000;
    plane.enabled = true;
    plane.material = {
      bounciness: 10000,
      rollingFriction: 1000,
      twistingFriction: 1000,
      dynamicFriction: 2000,
      staticFriction: 5000,
    };

    body.calculateHitCollider(100, plane, () => {}, () => {});

    // After hitting plane with full bounciness (1.0 * 1.0 = 1.0),
    // velocity.y should be positive (reflected)
    expect(body.velocity.y).toBeGreaterThan(0);
  });
});

// ─── calculateHitTrigger ─────────────────────────────────────────────────────

describe('CmRigidbody calculateHitTrigger', () => {
  it('sphere enters trigger → isKinematic=true, isActive=false', () => {
    const body = makeBody(new CmVector(0, 0, 0), 5000, MULTIPLIER);
    body.velocity = new CmVector(10000, 0, 0);

    const trigger = new CmKinematicTrigger();
    trigger.id = 42;
    trigger.position = new CmVector(3000, 0, 0); // within radius
    trigger.radius = 5000;

    body.calculateHitTrigger(trigger);

    expect(body.isKinematic).toBe(true);
    expect(body.isActive).toBe(false);
    expect(body.kinematicTriggerId).toBe(42);
  });
});

// ─── Property tests ──────────────────────────────────────────────────────────

describe('CmRigidbody property tests', () => {
  it('two-ball collision: energy does not increase', () => {
    const velArb = fc.integer({ min: -20000, max: 20000 });

    fc.assert(fc.property(velArb, velArb, (v1x, v2x) => {
      const a = makeBody(new CmVector(0, 0, 0), 5000, MULTIPLIER);
      const b = makeBody(new CmVector(8000, 0, 0), 5000, MULTIPLIER);
      a.velocity = new CmVector(v1x, 0, 0);
      b.velocity = new CmVector(v2x, 0, 0);
      a.firstHitDirection = CmVector.zero;
      b.firstHitDirection = CmVector.zero;

      // KE = (1/2) * m * v², but since same mass, compare v²
      const keBefore = fixMul(a.velocity.x, a.velocity.x) + fixMul(b.velocity.x, b.velocity.x);

      a.calculateHitBody(100, b, () => {}, () => {});

      const keAfter = fixMul(a.velocity.x, a.velocity.x) + fixMul(b.velocity.x, b.velocity.x);
      // Energy should not increase (allowing small tolerance for rounding)
      expect(keAfter).toBeLessThanOrEqual(keBefore + 10);
    }), { numRuns: 1000 });
  });

  it('AddImpulse(zero) never changes velocity', () => {
    const velArb = fc.integer({ min: -50000, max: 50000 });
    fc.assert(fc.property(velArb, velArb, velArb, (vx, vy, vz) => {
      const body = makeBody(CmVector.zero, 5000, MULTIPLIER);
      body.velocity = new CmVector(vx, vy, vz);
      body.addImpulse(CmVector.zero, body.collider.position, CmForceMode.Impulse);
      expect(body.velocity.x).toBe(vx);
      expect(body.velocity.y).toBe(vy);
      expect(body.velocity.z).toBe(vz);
    }), { numRuns: 1000 });
  });
});
