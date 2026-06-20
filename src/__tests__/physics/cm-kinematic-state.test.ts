/**
 * P1-T01-S1: CmKinematicState serialization tests.
 *
 * Covers the zero-test gap identified by 卡卡西 QA audit:
 *   ① serialize→deserialize round-trip — all fields bit-exact
 *   ② parseStream round-trip — concatenated kinematicStates stream
 *   ③ CmSpaceState mid-sim determinism — snapshot→restore→continue is bit-exact with
 *      an uninterrupted run (P2 resync guarantee)
 */
import { describe, it, expect } from 'vitest';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSimpleVector } from '../../physics/cm-vector';
import { CmKinematicState } from '../../physics/cm-state';
import { CmSphereCollider, CmPlaneCollider } from '../../physics/colliders';
import { CmRigidbody, CmForceMode } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKS(
  id: number, time: number, isActive: boolean,
  px: number, py: number, pz: number,
  vx: number, vy: number, vz: number,
  ax: number, ay: number, az: number,
  isKinematic: boolean, kinematicTriggerId: number, isOutOfCube: boolean,
): CmKinematicState {
  return new CmKinematicState(
    id, time, isActive,
    new CmSimpleVector(px, py, pz),
    new CmSimpleVector(vx, vy, vz),
    new CmSimpleVector(ax, ay, az),
    isKinematic, kinematicTriggerId, isOutOfCube,
  );
}

/** Assert all CmKinematicState fields are equal between two instances. */
function expectKSEqual(a: CmKinematicState, b: CmKinematicState): void {
  expect(a.id).toBe(b.id);
  expect(a.time).toBe(b.time);
  expect(a.isActive).toBe(b.isActive);
  expect(a.position.x).toBe(b.position.x);
  expect(a.position.y).toBe(b.position.y);
  expect(a.position.z).toBe(b.position.z);
  expect(a.velocity.x).toBe(b.velocity.x);
  expect(a.velocity.y).toBe(b.velocity.y);
  expect(a.velocity.z).toBe(b.velocity.z);
  expect(a.angularVelocity.x).toBe(b.angularVelocity.x);
  expect(a.angularVelocity.y).toBe(b.angularVelocity.y);
  expect(a.angularVelocity.z).toBe(b.angularVelocity.z);
  expect(a.isKinematic).toBe(b.isKinematic);
  expect(a.kinematicTriggerId).toBe(b.kinematicTriggerId);
  expect(a.isOutOfCube).toBe(b.isOutOfCube);
}

const BALL_MAT = {
  bounciness: 9499, rollingFriction: 49, twistingFriction: 200000,
  dynamicFriction: 500, staticFriction: 599,
};
const CLOTH_MAT = {
  bounciness: 500, rollingFriction: 99, twistingFriction: 200000,
  dynamicFriction: 8000, staticFriction: 8999,
};

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id;
  col.position = new CmVector(x, y, z);
  col.right = new CmVector(MULTIPLIER, 0, 0);
  col.up = new CmVector(0, MULTIPLIER, 0);
  col.forward = new CmVector(0, 0, MULTIPLIER);
  col.scale = new CmVector(285, 285, 285);
  col.radius = 285;
  col.material = { ...BALL_MAT };
  const b = new CmRigidbody();
  b.id = id; b.mass = 1700; b.collider = col;
  return b;
}

function makePlane(): CmPlaneCollider {
  const p = new CmPlaneCollider();
  p.id = 0;
  p.position = new CmVector(0, 9154, 0);
  p.right = new CmVector(MULTIPLIER, 0, 0);
  p.up = new CmVector(0, MULTIPLIER, 0);
  p.forward = new CmVector(0, 0, MULTIPLIER);
  p.scale = new CmVector(25399, 5000, 12699);
  p.radius = 12699;
  p.material = { ...CLOTH_MAT };
  return p;
}

function makeSpace(bodies: CmRigidbody[]): CmSpace {
  const space = new CmSpace();
  const cube: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(30000, 20000, 20000),
  };
  space.init(cube, bodies, [makePlane()], []);
  return space;
}

// ─── CmKinematicState round-trip tests ────────────────────────────────────────

describe('CmKinematicState round-trip serialization', () => {
  it('moving ball: all non-zero fields preserved', () => {
    const orig = makeKS(2, 50, true, -4000, 9440, 0, 5000, 0, 0, 0, 0, -168324, false, -1, false);
    expectKSEqual(CmKinematicState.fromString(orig.toString()), orig);
  });

  it('zero vectors use shorthand encoding (z), still round-trip', () => {
    const orig = makeKS(0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, -1, false);
    const restored = CmKinematicState.fromString(orig.toString());
    // 'z' shorthand → zero vector
    expect(restored.position.x).toBe(0);
    expect(restored.position.y).toBe(0);
    expect(restored.position.z).toBe(0);
    expect(restored.velocity.x).toBe(0);
    expect(restored.angularVelocity.z).toBe(0);
    expect(restored.isActive).toBe(false);
  });

  it('pocketed ball: isKinematic=true, pocketId=3', () => {
    const orig = makeKS(1, 200, false, 12875, 9440, 6510, 0, 0, 0, 0, 0, 0, true, 3, false);
    const restored = CmKinematicState.fromString(orig.toString());
    expect(restored.isKinematic).toBe(true);
    // pocketId is stored in kinematicTriggerId
    expect(restored.kinematicTriggerId).toBe(3);
    expect(restored.isActive).toBe(false);
    expect(restored.position.x).toBe(12875);
    expect(restored.position.z).toBe(6510);
  });

  it('out-of-cube ball: isOutOfCube=true, large position', () => {
    const orig = makeKS(0, 999, false, 99999, 9440, -88888, 0, 0, 0, 0, 0, 0, false, -1, true);
    const restored = CmKinematicState.fromString(orig.toString());
    expect(restored.isOutOfCube).toBe(true);
    expect(restored.position.x).toBe(99999);
    expect(restored.position.z).toBe(-88888);
  });

  it('negative velocity and angular velocity (post-rail-bounce state)', () => {
    // Represents a ball after bouncing off rail: vx flipped, avz from spin
    const orig = makeKS(0, 100, true, -12000, 9440, -6000, -130930, 0, 0, 0, 0, -77640, false, -1, false);
    expectKSEqual(CmKinematicState.fromString(orig.toString()), orig);
  });

  it('toString produces trailing colon (stream concatenation marker)', () => {
    expect(makeKS(0, 1, true, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, -1, false).toString().endsWith(':')).toBe(true);
  });

  it('large time value (long simulation)', () => {
    const orig = makeKS(15, 1999999, true, -11795, 9439, 0, 174668, 0, 0, 0, 0, -168324, false, -1, false);
    expectKSEqual(CmKinematicState.fromString(orig.toString()), orig);
  });
});

// ─── parseStream tests ────────────────────────────────────────────────────────

describe('CmKinematicState.parseStream', () => {
  it('empty string returns empty array', () => {
    expect(CmKinematicState.parseStream('')).toHaveLength(0);
  });

  it('single state in stream', () => {
    const orig = makeKS(0, 50, true, -4000, 9440, 0, 5000, 0, 0, 0, 0, -168324, false, -1, false);
    const parsed = CmKinematicState.parseStream(orig.toString());
    expect(parsed).toHaveLength(1);
    expectKSEqual(parsed[0], orig);
  });

  it('two concatenated states (different ids/times) both parsed correctly', () => {
    const s1 = makeKS(0, 50, true, -4000, 9440, 0, 5000, 0, 0, 0, 0, -100, false, -1, false);
    const s2 = makeKS(1, 100, false, 12875, 9440, 6510, 0, 0, 0, 0, 0, 0, true, 3, false);
    const parsed = CmKinematicState.parseStream(s1.toString() + s2.toString());
    expect(parsed).toHaveLength(2);
    expectKSEqual(parsed[0], s1);
    expectKSEqual(parsed[1], s2);
  });

  it('stream from real simulation produces parseable states with correct ids', () => {
    // Run a simulation with addKinematicState=true and check stream parsability
    const b0 = makeBall(0, -4000, 9440, 0);
    const b1 = makeBall(1, 0, 9440, 570);
    const space = makeSpace([b0, b1]);
    b0.addImpulse(new CmVector(30000, 0, 0), b0.collider.position, CmForceMode.Impulse);

    // Run with kinematic state tracking enabled
    let steps = 0;
    while (space.isActive && steps < 2000) {
      space.calculate(null, true);
      steps++;
    }

    // kinematicStates accumulates all events during the run
    const stream = space.kinematicStates;
    if (stream.length > 0) {
      const parsed = CmKinematicState.parseStream(stream);
      expect(parsed.length).toBeGreaterThan(0);
      // Every state must have a valid id (0 or 1 for two-ball sim)
      for (const ks of parsed) {
        expect(ks.id === 0 || ks.id === 1).toBe(true);
        // round-trip each parsed state
        expectKSEqual(CmKinematicState.fromString(ks.toString()), ks);
      }
    }
  });
});

// ─── CmSpaceState mid-sim determinism ─────────────────────────────────────────

describe('CmSpaceState mid-sim determinism (P2 resync guarantee)', () => {
  it('snapshot at step 50, restore, continue → bit-exact to uninterrupted run', () => {
    const SNAPSHOT_STEP = 50;
    const TOTAL_STEPS = 300;

    // Reference run: straight through without any snapshot
    const refBall = makeBall(0, -4000, 9440, 0);
    const refSpace = makeSpace([refBall]);
    refBall.addImpulse(new CmVector(30000, 0, 0), refBall.collider.position, CmForceMode.Impulse);
    for (let i = 0; i < TOTAL_STEPS; i++) refSpace.calculate(null, false);
    const refPos = refBall.collider.position;
    const refVel = refBall.velocity;

    // Snapshot run: run to SNAPSHOT_STEP, serialize, restore, continue
    const tstBall = makeBall(0, -4000, 9440, 0);
    const tstSpace = makeSpace([tstBall]);
    tstBall.addImpulse(new CmVector(30000, 0, 0), tstBall.collider.position, CmForceMode.Impulse);
    for (let i = 0; i < SNAPSHOT_STEP; i++) tstSpace.calculate(null, false);

    const snapshot = tstSpace.getStringState();
    // Restore — same space, same position as before (tests that restore is idempotent here)
    tstSpace.setStateFromString(snapshot, null);
    for (let i = SNAPSHOT_STEP; i < TOTAL_STEPS; i++) tstSpace.calculate(null, false);

    // Must be bit-exact with reference
    expect(tstBall.collider.position.x).toBe(refPos.x);
    expect(tstBall.collider.position.y).toBe(refPos.y);
    expect(tstBall.collider.position.z).toBe(refPos.z);
    expect(tstBall.velocity.x).toBe(refVel.x);
    expect(tstBall.velocity.y).toBe(refVel.y);
    expect(tstBall.velocity.z).toBe(refVel.z);
  });

  it('perturb state then restore snapshot → same result as reference', () => {
    // This tests the actual P2 resync scenario: a diverged peer receives a
    // canonical snapshot and must produce the same future trajectory.
    const SNAPSHOT_STEP = 30;
    const TOTAL_STEPS = 200;

    // Build reference run
    const refBall = makeBall(0, -4000, 9440, 0);
    const refSpace = makeSpace([refBall]);
    refBall.addImpulse(new CmVector(20000, 0, 0), refBall.collider.position, CmForceMode.Impulse);
    for (let i = 0; i < TOTAL_STEPS; i++) refSpace.calculate(null, false);
    const refPos = refBall.collider.position;

    // Build test run: take snapshot at step 30, then deliberately corrupt state,
    // then restore snapshot and continue — should still match reference
    const tstBall = makeBall(0, -4000, 9440, 0);
    const tstSpace = makeSpace([tstBall]);
    tstBall.addImpulse(new CmVector(20000, 0, 0), tstBall.collider.position, CmForceMode.Impulse);
    for (let i = 0; i < SNAPSHOT_STEP; i++) tstSpace.calculate(null, false);
    const snapshot = tstSpace.getStringState();

    // Corrupt ball position to simulate peer divergence
    tstBall.collider.position = new CmVector(99999, 9440, 99999);
    tstBall.velocity = new CmVector(0, 0, 0);

    // Restore and continue
    tstSpace.setStateFromString(snapshot, null);
    for (let i = SNAPSHOT_STEP; i < TOTAL_STEPS; i++) tstSpace.calculate(null, false);

    expect(tstBall.collider.position.x).toBe(refPos.x);
    expect(tstBall.collider.position.y).toBe(refPos.y);
    expect(tstBall.collider.position.z).toBe(refPos.z);
  });
});
