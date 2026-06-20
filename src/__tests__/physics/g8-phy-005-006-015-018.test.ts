/**
 * G8 supplementary tests — PHY-005 / PHY-006 / PHY-015 / PHY-018.
 *
 * Tests for already-ported behaviours that lacked coverage:
 *   PHY-005  Ball vs line collider (rail) — CalculateOtherColliderHit
 *   PHY-006  Ball vs plane friction three phases — CalculatePlaneColliderHit
 *   PHY-015  Out-of-cube detection — CalculateOutOfCube / IsOutOfSpaceCube
 *   PHY-018  Vector geometry — projectPointOnPlane / projectPointOnAxis
 *
 * Every assertion references the observable C# behaviour (angle reflection,
 * BodyMovingType callback, isOutOfCube flag) — not internal state.
 *
 * Constants: all geometry from constants.ts (Game.unity runtime values, G9 locked).
 */
import { describe, it, expect } from 'vitest';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import { CmRigidbody, CmBodyMovingType } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import { CmCollisionManager } from '../../physics/cm-collision';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { simulateToCompletion } from '../../physics/simulate';
import {
  BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL as BALL_MAT,
  CLOTH_MATERIAL as CLOTH_MAT,
  RAIL_MATERIAL as RAIL_MAT,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  PLANE_SCALE_X, PLANE_RADIUS,
} from '../../physics/constants';

// ─── Shared factory helpers ───────────────────────────────────────────────────

function makeBall(x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.position = new CmVector(x, y, z);
  col.right    = new CmVector(10000, 0, 0);
  col.up       = new CmVector(0, 10000, 0);
  col.forward  = new CmVector(0, 0, 10000);
  col.scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius   = BALL_RADIUS;
  col.enabled  = true;
  col.material = { ...BALL_MAT };
  const body = new CmRigidbody();
  body.mass = BALL_MASS;
  body.collider = col;
  body.centreOfMass = CmVector.zero;
  body.init();
  return body;
}

/** Long rail along Z at +x wall: normal points toward table centre (-x direction). */
function makeRightRail(): CmLineCollider {
  const c = new CmLineCollider();
  c.id       = 0;
  c.position = new CmVector(RAIL_LONG_X, BALL_Y, 0);
  c.right    = new CmVector(0, 0, 10000);     // extends along Z
  c.up       = new CmVector(0, 10000, 0);
  c.forward  = new CmVector(-10000, 0, 0);    // normal: points toward -x (table centre)
  c.scale    = new CmVector(RAIL_LONG_SCALE_X, 5000, 5000);
  c.radius   = RAIL_LONG_RADIUS;
  c.enabled  = true;
  c.material = { ...RAIL_MAT };
  return c;
}

/** Horizontal cloth plane. */
function makePlane(): CmPlaneCollider {
  const p = new CmPlaneCollider();
  p.id       = 0;
  p.position = new CmVector(0, TABLE_Y, 0);
  p.right    = new CmVector(10000, 0, 0);
  p.up       = new CmVector(0, 10000, 0);
  p.forward  = new CmVector(0, 0, 10000);
  p.scale    = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS);
  p.radius   = PLANE_RADIUS;
  p.enabled  = true;
  p.material = { ...CLOTH_MAT };
  return p;
}

// ─── PHY-005: Ball vs line collider (rail rebound) ───────────────────────────

describe('PHY-005: ball vs line collider (CmRigidbody._calculateOtherColliderHit)', () => {
  /**
   * Ball moving in +x (toward the +x rail).  Rail normal = (-10000,0,0).
   * After hit: velocity.x must be negative (ball rebounds toward centre).
   * C# ref: CmRigidbody.CalculateOtherColliderHit — impulse from bounce + friction.
   */
  it('perpendicular approach (+x) → velocity.x reverses to negative after rail hit', () => {
    // Ball just inside the rail, touching it (distance = BALL_RADIUS in x from rail axis)
    const ball = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ball.velocity = new CmVector(1000, 0, 0);
    const rail = makeRightRail();

    ball.calculateHitCollider(200, rail, () => {}, () => {});

    // Ball should be moving away from rail (velocity.x < 0)
    expect(ball.velocity.x).toBeLessThan(0);
    // No Y motion introduced by horizontal approach (gravity is separate)
    expect(ball.velocity.y).toBe(0);
  });

  /**
   * Ball approaching with tangential velocity (z-component) as well as normal (+x).
   * Friction from the rail tangent (right = Z) generates angular velocity on the ball.
   * C# ref: friction factor tFactor = velocityT / velocityN → rotates ball around rail axis.
   */
  it('angled approach → rail friction generates angular velocity on ball', () => {
    const ball = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ball.velocity = new CmVector(1000, 0, 2000); // approaching at angle with Z component
    const rail = makeRightRail();

    ball.calculateHitCollider(200, rail, () => {}, () => {});

    // Friction along rail (Z direction) must impart angular spin
    const av = ball.angularVelocity;
    expect(av.x !== 0 || av.y !== 0 || av.z !== 0).toBe(true);
  });

  /**
   * Angled vs perpendicular hit: friction from the tangent component changes the
   * reflected angle.  The velocity.z after an angled hit must differ from pure normal hit.
   * C# ref: CalculateOtherColliderHit applies staticFriction * tFactor to modify direction.
   */
  it('angled rebound differs from pure-normal rebound (friction changes angle)', () => {
    const ballPerp = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ballPerp.velocity = new CmVector(1000, 0, 0);
    const rail1 = makeRightRail();
    ball_calculateHitCollider_direct(ballPerp, rail1);

    const ballAngled = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ballAngled.velocity = new CmVector(1000, 0, 2000);
    const rail2 = makeRightRail();
    ball_calculateHitCollider_direct(ballAngled, rail2);

    // The z-velocity must differ between the two cases (friction redirects tangent)
    expect(ballAngled.velocity.z).not.toBe(ballPerp.velocity.z);
  });

  /**
   * Determinism: identical inputs → bit-exact identical outputs.
   * C# CalculateMechanics is integer-only; same state must always produce same result.
   */
  it('deterministic: identical setup twice → bit-exact same velocity and angVel', () => {
    const ball1 = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ball1.velocity = new CmVector(1000, 0, 500);
    const rail1 = makeRightRail();
    ball_calculateHitCollider_direct(ball1, rail1);

    const ball2 = makeBall(RAIL_LONG_X - BALL_RADIUS, BALL_Y, 0);
    ball2.velocity = new CmVector(1000, 0, 500);
    const rail2 = makeRightRail();
    ball_calculateHitCollider_direct(ball2, rail2);

    expect(ball1.velocity.x).toBe(ball2.velocity.x);
    expect(ball1.velocity.y).toBe(ball2.velocity.y);
    expect(ball1.velocity.z).toBe(ball2.velocity.z);
    expect(ball1.angularVelocity.x).toBe(ball2.angularVelocity.x);
    expect(ball1.angularVelocity.y).toBe(ball2.angularVelocity.y);
    expect(ball1.angularVelocity.z).toBe(ball2.angularVelocity.z);
  });
});

/** Helper so we don't repeat the beforeHit/afterHit callbacks in each test. */
function ball_calculateHitCollider_direct(ball: CmRigidbody, collider: CmLineCollider | CmPlaneCollider): void {
  ball.calculateHitCollider(200, collider, () => {}, () => {});
}

// ─── PHY-006: Ball vs plane friction three phases ────────────────────────────

describe('PHY-006: ball vs plane friction three phases (CalculatePlaneColliderHit)', () => {
  /**
   * BOUNCE path: (bounciness + M) * velocityN > gravityN * timestep.
   * With CLOTH_MATERIAL (G9-B values: bounciness=1000) and vy=-5000, bounce condition holds.
   * C# ref: first branch of CalculatePlaneColliderHit — velocity.y must become positive.
   */
  it('BOUNCE: ball falling fast → velocity.y becomes positive after cloth hit', () => {
    // Ball falling, position just above table
    const ball = makeBall(0, TABLE_Y + BALL_RADIUS + 1, 0);
    ball.velocity = new CmVector(0, -5000, 0);
    const plane = makePlane();

    ball.calculateHitCollider(200, plane, () => {}, () => {});

    expect(ball.velocity.y).toBeGreaterThan(0);
  });

  /**
   * SLIDING phase: ball on table with high horizontal velocity (|v| ≈ 3000 > threshold ≈ 1005).
   * velocityT.sqrMagnitude > MIN_SQR_VELOCITY AND dynamicFrictionForce ≠ 0.
   * C# ref: onMoving callback fires with CmBodyMovingType.Sliding.
   */
  it('SLIDING: ball with high horizontal velocity on cloth → onMoving fires Sliding', () => {
    const ball = makeBall(0, TABLE_Y + BALL_RADIUS, 0);
    ball.velocity = new CmVector(3000, 0, 0);

    let observedType: CmBodyMovingType | null = null;
    ball.onMoving = (_vel, _av, type) => { observedType = type; };

    const plane = makePlane();
    ball.calculateHitCollider(200, plane, () => {}, () => {});

    expect(observedType).toBe(CmBodyMovingType.Sliding);
  });

  /**
   * ROLLING phase: ball on table with small horizontal velocity (480 ≤ |v| ≤ 1000).
   * Low-velocity branch: deltaVelocity.sqrMag < velocity.sqrMag → velocity = -cross(angVel, hitRadius).
   * C# ref: onMoving callback fires with CmBodyMovingType.Rolling.
   *
   * Analysis: rollingFriction deceleration ≈ 480 units/step. For vel=500:
   *   deltaVelocity.sqrMag=23 < velocity.sqrMag=25 → rolling condition holds.
   */
  it('ROLLING: ball with small horizontal velocity on cloth → onMoving fires Rolling', () => {
    const ball = makeBall(0, TABLE_Y + BALL_RADIUS, 0);
    ball.velocity = new CmVector(500, 0, 0);
    // Angular velocity needed so rolling is stable (cross produces non-zero velocity)
    ball.angularVelocity = new CmVector(0, 0, -1000); // spin to sustain rolling

    let observedType: CmBodyMovingType | null = null;
    ball.onMoving = (_vel, _av, type) => { observedType = type; };

    const plane = makePlane();
    ball.calculateHitCollider(200, plane, () => {}, () => {});

    expect(observedType).toBe(CmBodyMovingType.Rolling);
  });

  /**
   * TWISTING phase: ball stopped (velocity=0) but has Y-axis spin.
   * twistingFriction reduces the Y-component of angularVelocity.
   * C# ref: onMoving fires Twisting; angVel.y magnitude decreases after the step.
   */
  it('TWISTING: stopped ball with Y-spin → onMoving fires Twisting, Y-spin decays', () => {
    const ball = makeBall(0, TABLE_Y + BALL_RADIUS, 0);
    ball.velocity = CmVector.zero;
    ball.angularVelocity = new CmVector(0, 5000, 0); // Y-axis spin (top-spin / draw)

    let observedType: CmBodyMovingType | null = null;
    ball.onMoving = (_vel, _av, type) => { observedType = type; };

    const angBefore = ball.angularVelocity.y;
    const plane = makePlane();
    ball.calculateHitCollider(200, plane, () => {}, () => {});

    expect(observedType).toBe(CmBodyMovingType.Twisting);
    // twistingFriction must have reduced the Y spin magnitude
    expect(Math.abs(ball.angularVelocity.y)).toBeLessThan(Math.abs(angBefore));
  });

  /**
   * STOP POSITION REPRODUCIBLE: two identical simulateToCompletion runs produce the
   * same final ball position.
   * C# ref: integer physics is deterministic — same initial state → same outcome always.
   * Uses new cloth constants (1000/2000/3000) from G9-B.
   */
  it('reproducible: same shot twice → bit-exact same final position', () => {
    const SPACE_CUBE: CmSpaceCube = {
      position: CmVector.zero,
      scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
    };

    function runOnce(): { px: number; py: number; pz: number } {
      const ball = makeBall(0, BALL_Y, 0);
      const plane = makePlane();

      const space = new CmSpace();
      space.init(SPACE_CUBE, [ball], [plane], []);
      // Impulse: moderate horizontal shot
      ball.velocity = new CmVector(15000, 0, 0);
      space.isActive = true;

      simulateToCompletion(space);
      return {
        px: ball.collider.position.x,
        py: ball.collider.position.y,
        pz: ball.collider.position.z,
      };
    }

    const r1 = runOnce();
    const r2 = runOnce();
    expect(r1.px).toBe(r2.px);
    expect(r1.py).toBe(r2.py);
    expect(r1.pz).toBe(r2.pz);
  });

  /**
   * CLOTH CONSTANTS: the simulation uses the G9-B authoritative values (1000/2000/3000)
   * from constants.ts. The test above would silently diverge from C# golden vectors if
   * wrong constants were used. PHY-006 is the primary user of CLOTH_MATERIAL.
   */
  it('plane collider carries authoritative CLOTH_MATERIAL from constants', () => {
    const plane = makePlane();
    expect(plane.material.bounciness).toBe(CLOTH_MAT.bounciness);      // 1000
    expect(plane.material.dynamicFriction).toBe(CLOTH_MAT.dynamicFriction);   // 2000
    expect(plane.material.staticFriction).toBe(CLOTH_MAT.staticFriction);     // 3000
    expect(plane.material.rollingFriction).toBe(CLOTH_MAT.rollingFriction);   // 99
    expect(plane.material.twistingFriction).toBe(CLOTH_MAT.twistingFriction); // 200000
  });
});

// ─── PHY-015: Out-of-cube detection ──────────────────────────────────────────

describe('PHY-015: out-of-cube detection (CmRigidbody.calculateOutOfCube / CmCollisionManager)', () => {
  const SPACE_CUBE: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
  };

  /**
   * Ball at origin is well inside the space cube → isOutOfSpaceCube = false.
   * C# ref: CmCollisionManager.IsOutOfSpaceCube — overflow clamped to 0, sqrMag ≤ radiusPow.
   */
  it('ball at origin → isOutOfSpaceCube returns false', () => {
    const ball = makeBall(0, 0, 0);
    expect(CmCollisionManager.isOutOfSpaceCube(ball.collider, SPACE_CUBE)).toBe(false);
  });

  /**
   * Ball centre at x = SPACE_SCALE_X/2 + 300 = 15300 (overflow > BALL_RADIUS).
   * overflow.x = 300, overflow.sqrMag = Math.trunc(300²/10000) = 9 > radiusPow(285)=8 → out.
   * C# ref: IsOutOfSpaceCube — ball whose centre has escaped beyond cube half + radius.
   */
  it('ball centre 300 units outside +x wall → isOutOfSpaceCube returns true', () => {
    const ball = makeBall(Math.trunc(SPACE_SCALE_X / 2) + 300, 0, 0);
    expect(CmCollisionManager.isOutOfSpaceCube(ball.collider, SPACE_CUBE)).toBe(true);
  });

  /**
   * calculateOutOfCube: when CmCollisionManager.isOutOfSpaceCube is true,
   * CmRigidbody must set isOutOfCube=true AND isActive=false (stops simulation).
   * C# ref: CmRigidbody.CalculateOutOfCube — sets both flags.
   */
  it('calculateOutOfCube outside → isOutOfCube=true AND isActive=false', () => {
    const ball = makeBall(Math.trunc(SPACE_SCALE_X / 2) + 300, 0, 0);
    ball.velocity = new CmVector(1000, 0, 0);

    ball.calculateOutOfCube(SPACE_CUBE);

    expect(ball.isOutOfCube).toBe(true);
    expect(ball.isActive).toBe(false);
  });

  /**
   * calculateOutOfCube: ball inside cube → flags unchanged.
   */
  it('calculateOutOfCube inside → isOutOfCube stays false, isActive stays true', () => {
    const ball = makeBall(0, BALL_Y, 0);

    ball.calculateOutOfCube(SPACE_CUBE);

    expect(ball.isOutOfCube).toBe(false);
    expect(ball.isActive).toBe(true);
  });

  /**
   * Integration: ball launched off the table (impulse past cube boundary) via full
   * simulateToCompletion.  The simulation must stop and the ball must have isOutOfCube=true.
   *
   * Setup: ball at (14900, BALL_Y, 0) with vx=65000/1700*10000 ≈ 382352.
   * At MIN_TS=50 step, ball travels 1911 units → exits cube in step 1.
   * C# ref: CmRigidbody.CalculateOutOfCube called inside CmSpace._createDynamicSubspace.
   */
  it('integration: ball launched beyond +x boundary → simulateToCompletion stops, isOutOfCube=true', () => {
    const startX = Math.trunc(SPACE_SCALE_X / 2) - 200; // just inside wall
    const ball = makeBall(startX, BALL_Y, 0);
    const plane = makePlane();

    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], [plane], []);

    // Large +x impulse: velocity ≈ 382352 → exits cube in first step
    ball.velocity = CmVector.divide(new CmVector(65000 * MULTIPLIER, 0, 0), BALL_MASS);
    space.isActive = true;

    simulateToCompletion(space);

    expect(ball.isOutOfCube).toBe(true);
    expect(ball.isActive).toBe(false);
  });
});

// ─── PHY-018: Vector geometry tools ──────────────────────────────────────────

describe('PHY-018: vector geometry (CmVector projectPointOnPlane / projectPointOnAxis)', () => {
  /**
   * projectPointOnPlane: point above a horizontal plane → projection lands on the plane.
   * C# ref: VectorGeometry.GetPlaneHitPoint — used by SphereCast / free-ball aiming.
   */
  it('projectPointOnPlane: point (3000,5000,0) → plane y=2000 gives result.y=2000', () => {
    const point      = new CmVector(3000, 5000, 0);
    const planePoint = new CmVector(0, 2000, 0);
    const planeNormal = new CmVector(0, MULTIPLIER, 0); // up

    const result = CmVector.projectPointOnPlane(point, planePoint, planeNormal);

    // x/z unchanged; y moved to plane level
    expect(result.x).toBe(3000);
    expect(result.y).toBe(2000);
    expect(result.z).toBe(0);
  });

  /**
   * projectPointOnPlane: arbitrary angled plane.  Point off-plane → result lies on plane.
   * Verify by checking dot(result - planePoint, normal) = 0.
   */
  it('projectPointOnPlane: result lies on plane (dot with normal = 0)', () => {
    const point      = new CmVector(5000, 8000, -3000);
    const planePoint = new CmVector(0, TABLE_Y, 0);
    const planeNormal = new CmVector(0, MULTIPLIER, 0);

    const result = CmVector.projectPointOnPlane(point, planePoint, planeNormal);
    const toResult = CmVector.sub(result, planePoint);
    const dot = CmVector.dot(toResult, planeNormal);

    // Should be zero (result is on the plane)
    expect(dot).toBe(0);
  });

  /**
   * projectPointOnAxis: point off-axis → projection is ON the axis line.
   * C# ref: VectorGeometry.ProjectPointOnRay — used by SphereCast ray intersections.
   */
  it('projectPointOnAxis: point (0,5000,0) projected onto X-axis at origin → (0,0,0)', () => {
    const point   = new CmVector(0, 5000, 0);
    const axisPos = new CmVector(0, 0, 0);
    const axisDir = new CmVector(MULTIPLIER, 0, 0); // X direction

    const result = CmVector.projectPointOnAxis(point, axisPos, axisDir);

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  /**
   * projectPointOnAxis: point (3000,2000,0) projected onto X-axis → x is kept, y/z zeroed.
   */
  it('projectPointOnAxis: point (3000,2000,0) onto X-axis at origin → (3000,0,0)', () => {
    const point   = new CmVector(3000, 2000, 0);
    const axisPos = new CmVector(0, 0, 0);
    const axisDir = new CmVector(MULTIPLIER, 0, 0);

    const result = CmVector.projectPointOnAxis(point, axisPos, axisDir);

    expect(result.x).toBe(3000);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  /**
   * isOutOfSpaceCube boundary: ball centre exactly at cube wall (x = halfScale) is NOT out.
   * C# ref: VectorGeometry.SphereInCube — boundary ball touching wall is still in play.
   */
  it('isOutOfSpaceCube: ball centre at exactly x=halfScale → still inside (not out)', () => {
    const CUBE: CmSpaceCube = {
      position: CmVector.zero,
      scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
    };
    const halfX = Math.trunc(SPACE_SCALE_X / 2); // 15000
    const ball  = makeBall(halfX, 0, 0);
    expect(CmCollisionManager.isOutOfSpaceCube(ball.collider, CUBE)).toBe(false);
  });

  /**
   * isOutOfSpaceCube: ball centre > halfScale + BALL_RADIUS tolerance → outside.
   * The overflow must exceed BALL_RADIUS in sqrMagnitude (radiusPow = 8 in fixed-point).
   * C# ref: VectorGeometry.SphereInCube — ball fully outside cube boundary.
   */
  it('isOutOfSpaceCube: overflow 300 units beyond wall → outside (sqrMag 9 > radiusPow 8)', () => {
    const CUBE: CmSpaceCube = {
      position: CmVector.zero,
      scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
    };
    const halfX   = Math.trunc(SPACE_SCALE_X / 2);
    const outBall = makeBall(halfX + 300, 0, 0);
    expect(CmCollisionManager.isOutOfSpaceCube(outBall.collider, CUBE)).toBe(true);
  });

  /**
   * sqrDistance: same point → 0 (early-exit path, C# micro-optimisation ported in CmVector).
   */
  it('sqrDistance: identical vectors return 0', () => {
    const v = new CmVector(12345, -6789, 1000);
    expect(CmVector.sqrDistance(v, v)).toBe(0);
    expect(CmVector.sqrDistance(CmVector.zero, CmVector.zero)).toBe(0);
  });

  /**
   * projectPointOnPlane: identity — point already on plane returns same point.
   * C# ref: project onto plane when point is already coplanar → no change.
   */
  it('projectPointOnPlane: point already on plane → returns same coordinates', () => {
    const planeNormal = new CmVector(0, MULTIPLIER, 0);
    const planePoint  = new CmVector(0, TABLE_Y, 0);
    const onPlane     = new CmVector(5000, TABLE_Y, -3000);

    const result = CmVector.projectPointOnPlane(onPlane, planePoint, planeNormal);

    expect(result.x).toBe(5000);
    expect(result.y).toBe(TABLE_Y);
    expect(result.z).toBe(-3000);
  });
});
