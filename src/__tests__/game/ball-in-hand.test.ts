/**
 * CUE-013: ball-in-hand pure logic tests.
 *
 * Tests: isPositionFree (overlap + bounds), clampToZone, BallInHandController
 * state machine (enter/move/commit/cancel). Uses a stub IBallPoolPhysics.
 */
import { describe, it, expect, vi } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import {
  isPositionFree, clampToZone,
  FULL_QUAD, FIRST_QUAD, MIN_OVERLAP_DIST,
  createBallInHandController,
  type PlacementZone,
} from '../../game/ball-in-hand';
import {
  BALL_Y, BALL_RADIUS,
  RAIL_LONG_X, RAIL_BACK_Z,
} from '../../physics/constants';
import type { IBallPoolPhysics, BallState, AimHit, ShotData, ShotResult, PhysicsConstants } from '../../game/ball-pool-physics';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBallState(id: number, x: number, z: number, isKinematic = false, isOutOfTable = false): BallState {
  return {
    id, isKinematic, isOutOfTable, isActive: true,
    position: new CmVector(x, BALL_Y, z),
    velocity: CmVector.zero,
    angularVelocity: CmVector.zero,
  };
}

// Minimal IBallPoolPhysics stub for BallInHandController tests
function makeStubPhysics(balls: BallState[]): IBallPoolPhysics {
  const placeBallFn = vi.fn();
  const respotCueBallFn = vi.fn();
  return {
    applyShot: vi.fn() as unknown as (shot: ShotData) => ShotResult,
    shotFrames: [],
    getBall: (id: number) => balls.find(b => b.id === id)!,
    getActiveBalls: () => balls.filter(b => !b.isKinematic && !b.isOutOfTable),
    allBalls: balls,
    predictAimLine: vi.fn() as unknown as (from: CmVector, dir: CmVector) => AimHit,
    step: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isSimulating: false,
    getStateAsString: vi.fn(() => ''),
    setStateFromString: vi.fn(),
    resetToStartState: vi.fn(),
    getPhysicsConstants: vi.fn() as unknown as () => PhysicsConstants,
    placeBall: placeBallFn,
    respotCueBall: respotCueBallFn,
  } as unknown as IBallPoolPhysics;
}

// ─── PlacementZone constants ──────────────────────────────────────────────────

describe('FULL_QUAD bounds', () => {
  it('minX = -(RAIL_LONG_X - BALL_RADIUS)', () => {
    expect(FULL_QUAD.minX).toBe(-(RAIL_LONG_X - BALL_RADIUS));
  });
  it('maxX = RAIL_LONG_X - BALL_RADIUS', () => {
    expect(FULL_QUAD.maxX).toBe(RAIL_LONG_X - BALL_RADIUS);
  });
  it('minZ = -(RAIL_BACK_Z - BALL_RADIUS)', () => {
    expect(FULL_QUAD.minZ).toBe(-(RAIL_BACK_Z - BALL_RADIUS));
  });
  it('maxZ = RAIL_BACK_Z - BALL_RADIUS', () => {
    expect(FULL_QUAD.maxZ).toBe(RAIL_BACK_Z - BALL_RADIUS);
  });
});

describe('FIRST_QUAD bounds (head string = left half)', () => {
  it('maxX ≤ 0 (confined to cue-ball side)', () => {
    expect(FIRST_QUAD.maxX).toBeLessThanOrEqual(0);
  });
  it('minX same as FULL_QUAD', () => {
    expect(FIRST_QUAD.minX).toBe(FULL_QUAD.minX);
  });
});

describe('MIN_OVERLAP_DIST', () => {
  it('equals Math.trunc(1.25 * 2 * BALL_RADIUS)', () => {
    expect(MIN_OVERLAP_DIST).toBe(Math.trunc(1.25 * 2 * BALL_RADIUS));
  });
});

// ─── clampToZone ─────────────────────────────────────────────────────────────

describe('clampToZone', () => {
  it('position inside zone: unchanged', () => {
    const r = clampToZone(0, 0, FULL_QUAD);
    expect(r.x).toBe(0);
    expect(r.z).toBe(0);
  });

  it('x too large: clamped to maxX', () => {
    const r = clampToZone(99999, 0, FULL_QUAD);
    expect(r.x).toBe(FULL_QUAD.maxX);
  });

  it('x too small: clamped to minX', () => {
    const r = clampToZone(-99999, 0, FULL_QUAD);
    expect(r.x).toBe(FULL_QUAD.minX);
  });

  it('z too large: clamped to maxZ', () => {
    const r = clampToZone(0, 99999, FULL_QUAD);
    expect(r.z).toBe(FULL_QUAD.maxZ);
  });

  it('z too small: clamped to minZ', () => {
    const r = clampToZone(0, -99999, FULL_QUAD);
    expect(r.z).toBe(FULL_QUAD.minZ);
  });
});

// ─── isPositionFree ──────────────────────────────────────────────────────────

describe('isPositionFree: bounds check', () => {
  it('center of table: free when no other balls', () => {
    const pos = new CmVector(0, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FULL_QUAD)).toBe(true);
  });

  it('x outside maxX: not free', () => {
    const pos = new CmVector(FULL_QUAD.maxX + 1, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FULL_QUAD)).toBe(false);
  });

  it('x outside minX: not free', () => {
    const pos = new CmVector(FULL_QUAD.minX - 1, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FULL_QUAD)).toBe(false);
  });

  it('z outside maxZ: not free', () => {
    const pos = new CmVector(0, BALL_Y, FULL_QUAD.maxZ + 1);
    expect(isPositionFree(pos, [], 0, FULL_QUAD)).toBe(false);
  });

  it('exactly at maxX boundary: free', () => {
    const pos = new CmVector(FULL_QUAD.maxX, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FULL_QUAD)).toBe(true);
  });
});

describe('isPositionFree: overlap check', () => {
  it('ball far away: free', () => {
    const pos = new CmVector(0, BALL_Y, 0);
    const balls = [makeBallState(1, 5000, 0)];
    expect(isPositionFree(pos, balls, 0, FULL_QUAD)).toBe(true);
  });

  it('ball within MIN_OVERLAP_DIST: not free', () => {
    // Place proposed at (0, BALL_Y, 0), other ball at (MIN_OVERLAP_DIST - 1, BALL_Y, 0)
    const other = MIN_OVERLAP_DIST - 1;
    const pos = new CmVector(0, BALL_Y, 0);
    const balls = [makeBallState(1, other, 0)];
    expect(isPositionFree(pos, balls, 0, FULL_QUAD)).toBe(false);
  });

  it('ball exactly at MIN_OVERLAP_DIST: free (strict less-than)', () => {
    const pos = new CmVector(0, BALL_Y, 0);
    const balls = [makeBallState(1, MIN_OVERLAP_DIST, 0)];
    // dist² = MIN_OVERLAP_DIST² → not < MIN_OVERLAP_DIST² → free
    expect(isPositionFree(pos, balls, 0, FULL_QUAD)).toBe(true);
  });

  it('excluded ball (excludeId): ignored', () => {
    // Ball 0 is the one being placed — should not block itself
    const pos = new CmVector(0, BALL_Y, 0);
    const balls = [makeBallState(0, 0, 0)];  // at same spot but excluded
    expect(isPositionFree(pos, balls, 0, FULL_QUAD)).toBe(true);
  });

  it('multiple balls: free only when all pass', () => {
    const pos = new CmVector(0, BALL_Y, 0);
    const balls = [
      makeBallState(1, 5000, 0),   // far → OK
      makeBallState(2, 200, 0),    // close (200 < 712) → blocks
    ];
    expect(isPositionFree(pos, balls, 0, FULL_QUAD)).toBe(false);
  });
});

describe('isPositionFree: FIRST_QUAD (head string zone)', () => {
  it('negative X position: free in FIRST_QUAD when no balls', () => {
    const pos = new CmVector(-3000, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FIRST_QUAD)).toBe(true);
  });

  it('positive X position: not free (outside firstQuad)', () => {
    const pos = new CmVector(3000, BALL_Y, 0);
    expect(isPositionFree(pos, [], 0, FIRST_QUAD)).toBe(false);
  });
});

// ─── BallInHandController ─────────────────────────────────────────────────────

describe('BallInHandController: state transitions', () => {
  it('initially idle (isActive=false)', () => {
    const physics = makeStubPhysics([makeBallState(0, 0, 0)]);
    const ctrl = createBallInHandController(physics, 0);
    expect(ctrl.isActive).toBe(false);
    expect(ctrl.proposedPosition).toBeNull();
  });

  it('enter() activates and sets proposed = cueBall position', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    expect(ctrl.isActive).toBe(true);
    expect(ctrl.proposedPosition).not.toBeNull();
    expect(ctrl.proposedPosition!.x).toBe(-5000);
    expect(ctrl.proposedPosition!.z).toBe(0);
  });

  it('cancel() returns to idle without calling placeBall', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.cancel();
    expect(ctrl.isActive).toBe(false);
    expect(ctrl.proposedPosition).toBeNull();
    expect(physics.placeBall).not.toHaveBeenCalled();
  });

  it('move() while inactive: no-op', () => {
    const balls = [makeBallState(0, 0, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.move(0.5, 0.3);
    expect(ctrl.proposedPosition).toBeNull();
  });
});

describe('BallInHandController: move and position update', () => {
  it('move() updates proposed position (float meters → Fixed)', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(0.3, -0.2);  // 0.3m, -0.2m
    expect(ctrl.proposedPosition!.x).toBe(3000);   // 0.3 * 10000
    expect(ctrl.proposedPosition!.z).toBe(-2000);  // -0.2 * 10000
    expect(ctrl.proposedPosition!.y).toBe(BALL_Y);
  });

  it('move() clamps to zone bounds', () => {
    const balls = [makeBallState(0, 0, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(99.0, 99.0);  // way outside table
    expect(ctrl.proposedPosition!.x).toBe(FULL_QUAD.maxX);
    expect(ctrl.proposedPosition!.z).toBe(FULL_QUAD.maxZ);
  });

  it('proposedIsFree = false when overlapping another ball', () => {
    const balls = [
      makeBallState(0, -5000, 0),   // cue ball
      makeBallState(1, 0, 0),       // target at origin
    ];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(0, 0);  // exactly at ball 1 → overlap
    expect(ctrl.proposedIsFree).toBe(false);
  });

  it('proposedIsFree = true when clear of all other balls', () => {
    const balls = [
      makeBallState(0, -5000, 0),
      makeBallState(1, 5000, 0),
    ];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(-0.5, 0);  // away from ball 1
    expect(ctrl.proposedIsFree).toBe(true);
  });
});

describe('BallInHandController: commit', () => {
  it('commit() calls placeBall and returns true when free', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(0, 0);  // free position
    const result = ctrl.commit();
    expect(result).toBe(true);
    expect(physics.placeBall).toHaveBeenCalledWith(0, expect.objectContaining({ x: 0, z: 0 }));
    expect(ctrl.isActive).toBe(false);
  });

  it('commit() returns false and does NOT call placeBall when position is occupied', () => {
    const balls = [
      makeBallState(0, -5000, 0),
      makeBallState(1, 200, 0),   // close to (0,0)
    ];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(0, 0);   // overlaps ball 1
    expect(ctrl.proposedIsFree).toBe(false);
    const result = ctrl.commit();
    expect(result).toBe(false);
    expect(physics.placeBall).not.toHaveBeenCalled();
  });

  it('commit() returns false when not active', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    const result = ctrl.commit();
    expect(result).toBe(false);
  });

  it('commit() leaves isActive=false after success', () => {
    const balls = [makeBallState(0, -5000, 0)];
    const physics = makeStubPhysics(balls);
    const ctrl = createBallInHandController(physics, 0);
    ctrl.enter();
    ctrl.move(0, 0);
    ctrl.commit();
    expect(ctrl.isActive).toBe(false);
    expect(ctrl.proposedPosition).toBeNull();
  });
});
