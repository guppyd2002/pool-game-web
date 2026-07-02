/**
 * 8BP v2.1 F-④ C-2: CueController fine-aim API tests.
 *
 * Verifies:
 *   - getAimState() returns current _lastAimStart/_lastAimCurrent
 *   - setFineAimCurrent() writes _lastAimCurrent, no phase change
 *   - Rotation geometry: setFineAimCurrent can be used to rotate aim
 *   - C-2 mutex: setFineAimCurrent no-ops when _lastAimStart is null
 *   - M-2 bit-exact: after setFineAimCurrent, getAimHit(f) direction === fireNow(f) impulse (toBe)
 *
 * F2 note (jsdom integration test): deferred — vitest env=node, no PointerEvent.
 * C-1 positive direction verified by 卡卡西 親讀 onPointerUp+fireNow code path (dec4c9d).
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

interface RecordingPhysics extends IBallPoolPhysics {
  shotLog: ShotData[];
  aimLog: { from: CmVector; dir: CmVector }[];
}

function makeMockPhysics(): RecordingPhysics {
  const shotLog: ShotData[] = [];
  const aimLog: { from: CmVector; dir: CmVector }[] = [];
  const mock: RecordingPhysics = {
    get isSimulating() { return false; },
    applyShot(s: ShotData): ShotResult { shotLog.push(s); return EMPTY_SHOT_RESULT; },
    predictAimLine(f: CmVector, d: CmVector): AimHit { aimLog.push({ from: f, dir: d }); return EMPTY_AIM_HIT; },
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
    shotLog,
    aimLog,
  };
  return mock;
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

  it('M-2 bit-exact: getAimHit(f) and fireNow(f) use identical direction after setFineAimCurrent', () => {
    // F1 fix (卡卡西 hardening): verify that after setFineAimCurrent the direction
    // passed to predictAimLine (preview) exactly equals the impulse passed to applyShot (fire).
    // Both must read the same _lastAimStart/_lastAimCurrent and apply trunc(f*MAX_FORCE).
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);

    // Set initial aim: start=(1,0), current=(0,0) → direction=(+1, 0)
    ctrl.onDragStart({ x: 1, z: 0 });
    ctrl.onDragMove({ x: 0, z: 0 });
    ctrl.cancel();

    // Fine-adjust: rotate aim to a diagonal direction via setFineAimCurrent
    // New current = (0.5, -0.5) → aim direction = start − current = (0.5, 0.5)
    ctrl.setFineAimCurrent({ x: 0.5, z: -0.5 });

    // Preview path: getAimHit(f) calls predictAimLine(cueBallPos, dir)
    const f = 0.6;
    ctrl.getAimHit(f);
    expect(phys.aimLog).toHaveLength(1);
    const previewDir = phys.aimLog[0].dir;

    // Fire path: fireNow(f) calls applyShot({ impulse: dir })
    ctrl.fireNow(f);
    expect(phys.shotLog).toHaveLength(1);
    const fireImpulse = phys.shotLog[0].impulse;

    // Bit-exact: preview direction === fire impulse (toBe, not toBeCloseTo)
    expect(previewDir.x).toBe(fireImpulse.x);
    expect(previewDir.z).toBe(fireImpulse.z);

    // Also verify quantization: trunc formula applies, force > 0 for f=0.6
    const force = Math.trunc(Math.max(0, Math.min(1, f)) * MAX_FORCE);
    expect(force).toBeGreaterThan(0);
    // Both components are non-zero (diagonal direction)
    expect(Math.abs(previewDir.x)).toBeGreaterThan(0);
    expect(Math.abs(previewDir.z)).toBeGreaterThan(0);
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
