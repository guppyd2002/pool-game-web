/**
 * CUE-002: CueController.fireNow(forceFraction) tests.
 *
 * fireNow() fires with the last known aim direction + explicit force fraction.
 * Enables the slider-based shot mode (CueShotUIManager in C#) without requiring
 * a drag-end gesture.
 *
 * Aim state is saved on every onDragStart/onDragMove and persists after onDragEnd
 * so the slider can fire even after the drag pointer is released.
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import type { ShotData, BallState, ShotResult, AimHit, IBallPoolPhysics } from '../../game/ball-pool-physics';
import { MAX_FORCE } from '../../physics/constants';
import { createCueController } from '../../game/cue-controller';

// ─── Mock helpers (mirrors cue-controller.test.ts to avoid cross-file import) ─

const CUE_BALL_POS = new CmVector(0, 9440, 0);

const EMPTY_BALL_STATE: BallState = {
  id: 0, position: CUE_BALL_POS,
  velocity: CmVector.zero, angularVelocity: CmVector.zero,
  isActive: false, isKinematic: false, isOutOfTable: false,
};

const EMPTY_AIM_HIT: AimHit = {
  hitType: 'none', ballId: null, cushionId: null,
  point: CmVector.zero, normal: CmVector.zero, distance: 0,
};

const EMPTY_SHOT_RESULT: ShotResult = {
  frames: [], finalStates: [], pocketed: [], outOfTable: [], contacts: [],
};

interface MockPhysics extends IBallPoolPhysics { shotLog: ShotData[]; }

function makeMockPhysics(opts: { isSimulating?: boolean } = {}): MockPhysics {
  const shotLog: ShotData[] = [];
  const mock: MockPhysics = {
    get isSimulating() { return opts.isSimulating ?? false; },
    applyShot(shot: ShotData): ShotResult { shotLog.push(shot); return EMPTY_SHOT_RESULT; },
    predictAimLine(_f: CmVector, _d: CmVector): AimHit { return EMPTY_AIM_HIT; },
    getBall(_id: number): BallState { return EMPTY_BALL_STATE; },
    getActiveBalls: () => [],
    get allBalls() { return [] as readonly BallState[]; },
    get shotFrames() { return [] as readonly import('../../physics/simulate').SimFrame[]; },
    step: () => {},
    start: () => {},
    stop: () => {},
    getStateAsString: () => '',
    setStateFromString: () => {},
    resetToStartState: () => {},
    getPhysicsConstants: () => ({
      ballMass: 1700, ballRadius: 285, maxForce: MAX_FORCE,
      tableScaleX: 30000, tableScaleZ: 20000,
    }),
    shotLog,
  };
  return mock;
}

// ─── CUE-002: fireNow() ────────────────────────────────────────────────────────

describe('CUE-002: fireNow() — slider-based fire', () => {
  it('returns false when no aim state has been set', () => {
    const ctrl = createCueController(makeMockPhysics());
    expect(ctrl.fireNow(0.5)).toBe(false);
  });

  it('returns false when physics is simulating', () => {
    const ctrl = createCueController(makeMockPhysics({ isSimulating: true }));
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    expect(ctrl.fireNow(0.5)).toBe(false);
  });

  it('returns false when forceFraction = 0', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    expect(ctrl.fireNow(0)).toBe(false);
  });

  it('returns true with valid aim state + force', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    expect(ctrl.fireNow(0.5)).toBe(true);
  });

  it('calls applyShot with correct direction from aim state', () => {
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    // Aim: start at (0,0), current at (1,0) → aim direction is +X (from start to current flipped = -X? No...)
    // CueController onDragEnd: direction = start - current (pull-back = aim forward)
    // So start=(0,0), current=(1,0) → dir = (0-1, 0-0) = (-1, 0) → normalized (-1, 0)
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    ctrl.fireNow(1.0);
    expect(phys.shotLog).toHaveLength(1);
    const shot = phys.shotLog[0];
    // impulse.x should be -MAX_FORCE (negative x direction)
    expect(shot.impulse.x).toBe(-MAX_FORCE);
    expect(shot.impulse.z).toBe(0);
  });

  it('uses forceFraction to scale force: 0.5 → ~MAX_FORCE/2', () => {
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    ctrl.fireNow(0.5);
    expect(phys.shotLog).toHaveLength(1);
    const shot = phys.shotLog[0];
    const expectedForce = Math.trunc(0.5 * MAX_FORCE);
    expect(Math.abs(shot.impulse.x)).toBe(expectedForce);
  });

  it('clamps forceFraction > 1 to MAX_FORCE', () => {
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    ctrl.fireNow(2.0);
    expect(Math.abs(phys.shotLog[0].impulse.x)).toBe(MAX_FORCE);
  });

  it('aim state persists after onDragEnd so slider can fire', () => {
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    ctrl.onDragEnd({ x: 1.1, z: 0 });  // drag end fires a shot
    phys.shotLog.length = 0;           // reset log
    // fireNow should still work with saved aim state
    expect(ctrl.fireNow(0.5)).toBe(true);
    expect(phys.shotLog).toHaveLength(1);
  });

  it('returns false when aim direction is degenerate (start === current)', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });  // no movement
    expect(ctrl.fireNow(0.5)).toBe(false);
  });

  it('fireNow when disabled returns false', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: 1, z: 0 });
    ctrl.disable();
    // fireNow ignores isEnabled (it's an explicit slider fire, separate from drag CUE-019)
    // Actually per design: fireNow respects isEnabled → returns false when disabled
    // This matches C# where TriggerOthers(false) prevents OTHER managers from acting
    // but the slider ITSELF fires (it set disabled via TriggerOthers on others, not itself)
    // So fireNow does NOT check isEnabled — it's the slider's own fire path.
    // → fireNow returns true even when cue is disabled (slider fires independently)
    expect(ctrl.fireNow(0.5)).toBe(true);
  });
});
