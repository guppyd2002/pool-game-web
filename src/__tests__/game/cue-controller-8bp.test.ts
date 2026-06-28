/**
 * CUE-8BP: CueController — 8BP 分離式 aim/power 模式新增行為測試.
 *
 * 測試 M-2 (getAimHit with forceFraction parameter):
 *   - 8BP 模式下 power bar 設定力道時，預覽線需要讀 _lastAimStart/_lastAimCurrent
 *     (而非 live drag 狀態)，且力道量化與 fireNow 同公式 (bit-exact).
 *   - getAimHit(forceFraction) 在 idle 相位但有存態時應返回預覽.
 *
 * 向後相容：getAimHit() 無參數時仍走舊行為 (phase-gated)，現有測試不受影響.
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import type { ShotData, BallState, ShotResult, AimHit, IBallPoolPhysics } from '../../game/ball-pool-physics';
import { MAX_FORCE } from '../../physics/constants';
import { createCueController } from '../../game/cue-controller';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

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

interface MockPhysics extends IBallPoolPhysics {
  shotLog: ShotData[];
  aimLog: { from: CmVector; dir: CmVector }[];
}

function makeMockPhysics(opts: { isSimulating?: boolean } = {}): MockPhysics {
  const shotLog: ShotData[] = [];
  const aimLog: { from: CmVector; dir: CmVector }[] = [];
  const mock: MockPhysics = {
    get isSimulating() { return opts.isSimulating ?? false; },
    applyShot(shot: ShotData): ShotResult { shotLog.push(shot); return EMPTY_SHOT_RESULT; },
    predictAimLine(from: CmVector, dir: CmVector): AimHit { aimLog.push({ from, dir }); return EMPTY_AIM_HIT; },
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

// ─── M-2: getAimHit(forceFraction) — 8BP preview path ────────────────────────

describe('M-2: getAimHit(forceFraction) — 8BP 模式預覽線', () => {
  it('getAimHit(forceFraction) returns null when no aim state has been set', () => {
    const ctrl = createCueController(makeMockPhysics());
    // No drag done yet, _lastAimStart/_lastAimCurrent both null
    expect(ctrl.getAimHit(0.5)).toBeNull();
  });

  it('getAimHit(forceFraction) returns preview after aim drag + cancel (idle phase)', () => {
    // 8BP: aim drag sets _lastAimStart/_lastAimCurrent, cancel goes idle
    // Power bar preview must still work while idle
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -0.5, z: 0 });
    ctrl.cancel();  // goes idle — _lastAimStart/_lastAimCurrent persist
    expect(ctrl.phase).toBe('idle');
    const result = ctrl.getAimHit(0.5);
    expect(result).not.toBeNull();
    expect(phys.aimLog).toHaveLength(1);
  });

  it('getAimHit(0) returns null — zero force collapses quantized impulse to zero', () => {
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -0.5, z: 0 });
    ctrl.cancel();
    expect(ctrl.getAimHit(0)).toBeNull();
  });

  it('getAimHit(forceFraction) uses trunc(forceFraction*MAX_FORCE) — same formula as fireNow', () => {
    // M-2 bit-exact: getAimHit(f) and fireNow(f) must produce the same quantized impulse
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -1, z: 0 });  // pure -x aim, start→current = direction +x
    ctrl.cancel();

    const f = 0.7;
    ctrl.getAimHit(f);  // triggers predictAimLine
    expect(phys.aimLog).toHaveLength(1);

    // The direction vector passed to predictAimLine should be integer (Fixed)
    const dir = phys.aimLog[0].dir;
    expect(dir.x).toBe(Math.trunc(dir.x));
    expect(dir.z).toBe(Math.trunc(dir.z));

    // Now fire and compare impulse magnitude
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -1, z: 0 });
    ctrl.cancel();
    ctrl.fireNow(f);
    expect(phys.shotLog).toHaveLength(1);

    // The impulse passed to applyShot and the dir passed to predictAimLine
    // should use the same quantized force: trunc(f * MAX_FORCE)
    const expectedForce = Math.trunc(f * MAX_FORCE);
    expect(Math.abs(phys.shotLog[0].impulse.x)).toBe(expectedForce);
    expect(Math.abs(dir.x)).toBe(expectedForce);
  });

  it('getAimHit(forceFraction) direction matches fireNow direction (bit-exact aim)', () => {
    // Both must use the same _lastAimStart/_lastAimCurrent point pair
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0.1, z: 0.2 });
    ctrl.onDragMove({ x: -0.8, z: 0.5 });
    ctrl.cancel();

    const f = 0.5;
    ctrl.getAimHit(f);
    expect(phys.aimLog).toHaveLength(1);
    const previewDir = phys.aimLog[0].dir;

    ctrl.onDragStart({ x: 0.1, z: 0.2 });
    ctrl.onDragMove({ x: -0.8, z: 0.5 });
    ctrl.cancel();
    ctrl.fireNow(f);
    expect(phys.shotLog).toHaveLength(1);
    const fireImpulse = phys.shotLog[0].impulse;

    // Same direction and magnitude (single canonical trunc)
    expect(previewDir.x).toBe(fireImpulse.x);
    expect(previewDir.z).toBe(fireImpulse.z);
  });

  it('getAimHit() no-arg still returns null when idle (backward compat)', () => {
    // Existing behavior: without forceFraction, still phase-gated
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -0.5, z: 0 });
    ctrl.cancel();  // idle
    expect(ctrl.getAimHit()).toBeNull();  // no arg → old behavior → null
  });

  it('getAimHit(forceFraction) works after onDragEnd (aim state persists within turn)', () => {
    // 8BP: after drag end (aim committed), power bar can still show preview within same turn
    const phys = makeMockPhysics();
    const ctrl = createCueController(phys);
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -0.5, z: 0 });
    ctrl.onDragEnd({ x: -0.5, z: 0 });  // fires in drag-power mode; aim state persists
    phys.shotLog.length = 0;
    const result = ctrl.getAimHit(0.5);
    expect(result).not.toBeNull();
  });

  it('resetForNewTurn() clears CUE-002 aim state — no cross-turn stale aim line', () => {
    // F-A/boundary-#2: after resetForNewTurn, the new player has no saved aim.
    // getAimHit(forceFraction) must return null until the new player drags.
    const ctrl = createCueController(makeMockPhysics());
    ctrl.onDragStart({ x: 0, z: 0 });
    ctrl.onDragMove({ x: -0.5, z: 0 });
    ctrl.cancel();  // commit aim for Player 1
    ctrl.resetForNewTurn();  // turn change: Player 2 starts
    // Player 2 has not aimed yet — no stale aim line from Player 1
    expect(ctrl.getAimHit(0.5)).toBeNull();
    // Also fireNow must fail (no saved aim for this turn)
    expect(ctrl.fireNow(0.5)).toBe(false);
  });
});
