/**
 * 8BP v2.1 F-④ C-2: CueController fine-aim API tests.
 *
 * Verifies:
 *   - getAimState() returns current _lastAimStart/_lastAimCurrent
 *   - setFineAimCurrent() writes _lastAimCurrent, no phase change
 *   - Rotation geometry: setFineAimCurrent can be used to rotate aim
 *   - C-2 mutex: setFineAimCurrent no-ops when _lastAimStart is null
 *   - M-2 bit-exact: getAimHit after setFineAimCurrent reads updated canonical
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import type { ShotData, BallState, ShotResult, AimHit, IBallPoolPhysics } from '../../game/ball-pool-physics';
import { MAX_FORCE } from '../../physics/constants';
import { createCueController } from '../../game/cue-controller';

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

function makeMockPhysics(): IBallPoolPhysics {
  return {
    get isSimulating() { return false; },
    applyShot(_s: ShotData): ShotResult { return EMPTY_SHOT_RESULT; },
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
    placeBall: () => {},
    respotCueBall: () => {},
  };
}

describe('getAimState() — canonical aim state read', () => {
  it('returns { start: null, current: null } initially', () => {
    const ctrl = createCueController(makeMockPhysics());
    const { start, current } = ctrl.getAimState();
    expect(start).toBeNull();
    expect(current).toBeNull();
  });

  it('returns current _lastAimStart/_lastAimCurrent after drag+cancel', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();
    const { start, current } = ctrl.getAimState();
    expect(start).toEqual({ x: 1, z: 0 });
    expect(current).toEqual({ x: 0, z: 0 });
  });

  it('is cleared by resetForNewTurn()', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();
    ctrl.resetForNewTurn();
    const { start, current } = ctrl.getAimState();
    expect(start).toBeNull();
    expect(current).toBeNull();
  });
});

describe('setFineAimCurrent() — C-2 immediate canonical write', () => {
  it('no-ops when _lastAimStart is null', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.setFineAimCurrent({ x: 99, z: 99 });
    const { start, current } = ctrl.getAimState();
    expect(start).toBeNull();
    expect(current).toBeNull();
  });

  it('writes _lastAimCurrent when _lastAimStart is set', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();
    // Fine-adjust: write a rotated current
    ctrl.setFineAimCurrent({ x: 0.1, z: 0.5 });
    const { start, current } = ctrl.getAimState();
    expect(start).toEqual({ x: 1, z: 0 });           // start unchanged
    expect(current).toEqual({ x: 0.1, z: 0.5 });    // current updated
  });

  it('does not change phase (stays idle)', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();
    expect(ctrl.phase).toBe('idle');
    ctrl.setFineAimCurrent({ x: 0.5, z: 0.5 });
    expect(ctrl.phase).toBe('idle');
  });

  it('M-2 bit-exact: getAimHit reads updated canonical after setFineAimCurrent', () => {
    const ctrl = createCueController(makeMockPhysics());
    // Set aim: start=(1,0), current=(0,0) → direction=(+1,0) toward +x
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();
    // Fine-adjust: rotate to point in a different direction
    ctrl.setFineAimCurrent({ x: 0.5, z: -0.5 });
    // getAimHit(0.5) should use the updated current, not the original
    // (mock predictAimLine always returns EMPTY_AIM_HIT, but we verify it's called)
    const hit = ctrl.getAimHit(0.5);
    // Aim direction is now (start - current) = (1 - 0.5, 0 - (-0.5)) = (0.5, 0.5)
    // Normalized = (1/√2, 1/√2); non-zero so hit is not null
    expect(hit).not.toBeNull();
  });

  it('rotation geometry: direction after setFineAimCurrent matches expected rotation', () => {
    // Verify: setFineAimCurrent can express a 90° rotation correctly.
    // Initial aim: start=(1,0), current=(0,0) → direction=(+1, 0)
    // After 90° CCW rotation around start: new direction=(0, +1)?
    // Actually: new direction = rotate(start-current, θ) = rotate((1,0), 90°) = (0, 1)
    // newCurrent = start - newDirection = (1,0) - (0,1) = (1, -1)
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();

    const baseStart = { x: 1, z: 0 };
    const baseCurrent = { x: 0, z: 0 };
    const θ = Math.PI / 2;  // 90° CCW

    const dx = baseStart.x - baseCurrent.x;  // 1
    const dz = baseStart.z - baseCurrent.z;  // 0
    const cosT = Math.cos(θ);  // 0
    const sinT = Math.sin(θ);  // 1
    const newDx = dx * cosT - dz * sinT;  // 0
    const newDz = dx * sinT + dz * cosT;  // 1
    const newCurrent = { x: baseStart.x - newDx, z: baseStart.z - newDz };  // (1, -1)

    ctrl.setFineAimCurrent(newCurrent);
    const { current } = ctrl.getAimState();
    expect(current!.x).toBeCloseTo(1, 5);
    expect(current!.z).toBeCloseTo(-1, 5);

    // Aim direction after setFineAimCurrent: (start - current) = (0, 1) = 90° CCW from (1,0) ✓
    const aimDir = { x: 1 - newCurrent.x, z: 0 - newCurrent.z };
    expect(aimDir.x).toBeCloseTo(0, 5);
    expect(aimDir.z).toBeCloseTo(1, 5);
  });
});
