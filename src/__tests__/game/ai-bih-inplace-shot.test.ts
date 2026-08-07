/**
 * DIV-008 (b) — Unity-faithful BIH when AI returns no placement.
 * Pin: null cueBallNewPos → cue ball world position unchanged; forceShot uses that geometry.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachHumanVsAI } from '../../game/human-vs-ai';
import { createBallPool8Session } from '../../game/game-session';
import type { GameSessionDeps } from '../../game/game-session';
import type { IBallPoolPhysics, ShotResult, BallState, AimHit, PhysicsConstants } from '../../game/ball-pool-physics';
import type { CueController } from '../../game/cue-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import { createPoolTable } from '../../game/table-setup';
import * as AiController from '../../game/ai-controller';
import { CmVector } from '../../physics/cm-vector';
import * as THREE from 'three';
import { BALL_Y } from '../../physics/constants';

function noShot(): ShotResult {
  return { pocketed: [], outOfTable: [], contacts: [], frames: [], finalStates: [] };
}

describe('DIV-008 (b) AI BIH null placement → in-place shot', () => {
  let scheduled: Array<() => void>;

  beforeEach(() => {
    scheduled = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('null cueBallNewPos: placeBall not called with new pos; respotCueBall never called; cue stays', () => {
    const cuePos = new CmVector(-5000, BALL_Y, 1000);
    const ball = {
      id: 0,
      position: cuePos,
      velocity: CmVector.zero,
      angularVelocity: CmVector.zero,
      isPocketed: false,
      isOutOfTable: false,
    } as unknown as BallState;

    const placeBall = vi.fn();
    const respotCueBall = vi.fn();
    const applyShot = vi.fn().mockReturnValue(noShot());

    const physics = {
      applyShot,
      placeBall,
      respotCueBall,
      getBall: vi.fn().mockReturnValue(ball),
      getBalls: vi.fn().mockReturnValue([ball]),
      isSimulating: false,
      predictAimLine: vi.fn().mockReturnValue(null as AimHit | null),
      resetToStartState: vi.fn(),
      getConstants: vi.fn().mockReturnValue({} as PhysicsConstants),
      getSpace: vi.fn(),
      getStateAsString: vi.fn().mockReturnValue(''),
      setStateFromString: vi.fn(),
      getPhysicsConstants: vi.fn().mockReturnValue({} as PhysicsConstants),
      getActiveBalls: vi.fn().mockReturnValue([ball]),
      allBalls: [ball],
      shotFrames: [],
      step: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as IBallPoolPhysics;

    let enabled = true;
    const cue = {
      phase: 'idle',
      onDragStart: vi.fn(),
      onDragMove: vi.fn(),
      onDragEnd: vi.fn().mockReturnValue(false),
      cancel: vi.fn(),
      getPowerFraction: () => 0,
      getAimHit: () => null,
      hasEnergy: () => true,
      dragDistToForce: () => 0,
      setSpinOffset: vi.fn(),
      getSpinOffset: () => ({ x: 0, y: 0 }),
      setVerticalAngle: vi.fn(),
      getVerticalAngle: () => 0,
      get isEnabled() { return enabled; },
      enable: vi.fn(() => { enabled = true; }),
      disable: vi.fn(() => { enabled = false; }),
      fireNow: vi.fn(() => false),
      resetForNewTurn: vi.fn(() => { enabled = true; }),
      aimLineVisible: true,
      toggleAimLine: vi.fn(),
      onShotApplied: null,
      onShotData: null,
    } as unknown as CueController;

    let replayCb: (() => void) | null = null;
    const replayDriver = {
      watch: vi.fn((_p, _s, _pk, _o, onDone: () => void) => { replayCb = onDone; }),
      resetVisibility: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ReplayDriver;

    const scene = {
      balls: Array.from({ length: 16 }, () => new THREE.Mesh()),
      updateBallPosition: vi.fn(),
      updateBallRotation: vi.fn(),
      setOrthoTop: vi.fn(),
      dispose: vi.fn(),
      toggleColliders: vi.fn(),
    } as unknown as SceneAPI;

    const space = createPoolTable();
    const session = createBallPool8Session({ physics, cue, scene, replayDriver } as GameSessionDeps);

    const fixedImpulse = new CmVector(1234, 0, 5678);
    vi.spyOn(AiController, 'calculateAIShot').mockReturnValue({
      shotData: {
        position: cuePos,
        impulse: fixedImpulse,
        torque: CmVector.zero,
      },
      cueBallNewPos: null, // ← no placement
    });

    attachHumanVsAI(session, physics, space, {
      aiSeat: 1,
      turnDelayMs: 0,
      bihSettleMs: 0,
      seed: 1,
      setTimeoutFn: (fn) => {
        scheduled.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: vi.fn(),
    });

    session.startNewGame();
    // Human break foul → AI BIH
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(0, 0, 1000),
      torque: CmVector.zero,
    });
    replayCb?.();

    expect(session.currentPlayerIndex).toBe(1);
    placeBall.mockClear();
    respotCueBall.mockClear();
    applyShot.mockClear();

    // Drain AI turn delay + BIH settle
    while (scheduled.length > 0) scheduled.shift()!();

    expect(respotCueBall).not.toHaveBeenCalled();
    // May still call placeBall only if non-null — must not place for null path
    expect(placeBall).not.toHaveBeenCalled();
    expect(applyShot).toHaveBeenCalled();
    const shotArg = applyShot.mock.calls[0][0];
    expect(shotArg.impulse.x).toBe(fixedImpulse.x);
    expect(shotArg.impulse.z).toBe(fixedImpulse.z);
    // Cue ball position object still the same coords (mock getBall unchanged)
    expect(physics.getBall(0).position.x).toBe(cuePos.x);
    expect(physics.getBall(0).position.z).toBe(cuePos.z);
  });
});
