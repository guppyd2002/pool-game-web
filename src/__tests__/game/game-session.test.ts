/**
 * P1-T04 — IGameSession orchestration tests.
 *
 * Uses real rule-engine + real game-store. Mocks: physics, cue, scene, replayDriver.
 *
 * Rule-engine initial state scenarios (deterministic given known ShotResult inputs):
 *   noShot()       → break foul (YouNo4BoardHit)        → turnChanged=true, ballInHand=true
 *   blackPocketed()→ illegal black pocket (initial state)→ gameEnded=true, winner=1
 *   hit1Rail()     → proper contact+rail, no pocket      → turnChanged=true, ballInHand=false
 *                    (used only on shot 2, after break opened the table)
 */

import { describe, it, expect, vi } from 'vitest';
import { createBallPool8Session } from '../../game/game-session';
import type { IGameSession, GameSessionDeps } from '../../game/game-session';
import type { IBallPoolPhysics, BallState, AimHit, PhysicsConstants, ShotData, ShotResult } from '../../game/ball-pool-physics';
import type { CueController } from '../../game/cue-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import * as THREE from 'three';
import { CmVector } from '../../physics/cm-vector';

// ─── ShotResult factories ─────────────────────────────────────────────────────

function noShot(): ShotResult {
  return { pocketed: [], outOfTable: [], contacts: [], frames: [], finalStates: [] };
}

function blackPocketed(): ShotResult {
  return {
    pocketed: [{ ballId: 8, pocketId: 0, stepIndex: 5 }],
    outOfTable: [], contacts: [], frames: [], finalStates: [],
  };
}

/**
 * Hit solid ball 1, one cushion contact — produces turnChanged=true, ballInHand=false
 * when called on shot 2 (after tableIsOpened=true).
 */
function hit1Rail(): ShotResult {
  return {
    pocketed: [],
    outOfTable: [],
    contacts: [
      { kind: 'ball', ballId: 0, otherBallId: 1, cushionId: null, stepIndex: 2 },
      { kind: 'cushion', ballId: 1, otherBallId: null, cushionId: 0, stepIndex: 3 },
    ],
    frames: [],
    finalStates: [],
  };
}

// ─── Mock builders ────────────────────────────────────────────────────────────

function makeMesh(): THREE.Mesh {
  const m = new THREE.Mesh();
  m.visible = true;
  return m;
}

function makeScene(count = 16): SceneAPI {
  return {
    balls: Array.from({ length: count }, makeMesh),
    camera: null as unknown as THREE.PerspectiveCamera,
    renderer: null as unknown as THREE.WebGLRenderer,
    scene: null as unknown as THREE.Scene,
    table: null as unknown as THREE.Group,
    updateBallPosition: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function makePhysics(): IBallPoolPhysics {
  return {
    applyShot: vi.fn() as unknown as (s: ShotData) => ShotResult,
    shotFrames: [],
    getBall: vi.fn().mockReturnValue({
      id: 0, position: new CmVector(0, 0, 0), velocity: new CmVector(0, 0, 0),
      angularVelocity: new CmVector(0, 0, 0), isKinematic: false, isOutOfTable: false,
    } as BallState),
    getActiveBalls: vi.fn().mockReturnValue([]),
    allBalls: [],
    predictAimLine: vi.fn() as unknown as (from: unknown, dir: unknown) => AimHit,
    step: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    get isSimulating() { return false; },
    getStateAsString: vi.fn().mockReturnValue(''),
    setStateFromString: vi.fn(),
    resetToStartState: vi.fn(),
    getPhysicsConstants: vi.fn() as unknown as () => PhysicsConstants,
    placeBall: vi.fn(),
    respotCueBall: vi.fn(),
  };
}

interface MockCue extends CueController {
  fireShotApplied(result: ShotResult): void;
}

function makeCue(): MockCue {
  let _hook: ((r: ShotResult) => void) | null = null;
  const cue = {
    get onShotApplied() { return _hook; },
    set onShotApplied(fn: ((r: ShotResult) => void) | null) { _hook = fn; },
    disable: vi.fn(),
    enable: vi.fn(),
    resetForNewTurn: vi.fn(),
    cancel: vi.fn(),
    get phase() { return 'idle' as const; },
    get isEnabled() { return true; },
    get aimLineVisible() { return true; },
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    onDragEnd: vi.fn().mockReturnValue(false),
    fireNow: vi.fn().mockReturnValue(false),
    getPowerFraction: vi.fn().mockReturnValue(0),
    getAimHit: vi.fn().mockReturnValue(null),
    hasEnergy: vi.fn().mockReturnValue(true),
    dragDistToForce: vi.fn().mockReturnValue(0),
    setSpinOffset: vi.fn(),
    getSpinOffset: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    setVerticalAngle: vi.fn(),
    getVerticalAngle: vi.fn().mockReturnValue(0),
    toggleAimLine: vi.fn(),
    // test helper
    fireShotApplied(result: ShotResult) { _hook?.(result); },
  };
  return cue as unknown as MockCue;
}

interface MockReplayDriver extends ReplayDriver {
  triggerComplete(): void;
  lastWatchArgs: Parameters<ReplayDriver['watch']> | null;
}

function makeReplayDriver(): MockReplayDriver {
  let _cb: (() => void) | null = null;
  let _lastArgs: Parameters<ReplayDriver['watch']> | null = null;
  return {
    watch: vi.fn((...args: Parameters<ReplayDriver['watch']>) => {
      _lastArgs = args;
      _cb = args[4];
    }),
    resetVisibility: vi.fn(),
    dispose: vi.fn(),
    get lastWatchArgs() { return _lastArgs; },
    triggerComplete() { _cb?.(); },
  } as unknown as MockReplayDriver;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

interface Fixtures {
  physics: IBallPoolPhysics;
  cue: MockCue;
  scene: SceneAPI;
  replayDriver: MockReplayDriver;
  session: IGameSession;
}

function setup(): Fixtures {
  const physics = makePhysics();
  const cue = makeCue();
  const scene = makeScene();
  const replayDriver = makeReplayDriver();
  const deps: GameSessionDeps = { physics, cue, scene, replayDriver };
  const session = createBallPool8Session(deps);
  return { physics, cue, scene, replayDriver, session };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('game-session — IGameSession (GAME-018)', () => {

  it('creates session with MainMenu phase', () => {
    const { session } = setup();
    expect(session.store.getState().phase).toBe('MainMenu');
    expect(session.isGameEnded).toBe(false);
  });

  describe('startNewGame()', () => {
    it('transitions to Aiming and resets physics', () => {
      const { physics, session } = setup();
      session.startNewGame();
      expect(session.store.getState().phase).toBe('Aiming');
      expect(physics.resetToStartState).toHaveBeenCalledTimes(1);
    });

    it('resets ball visibility and places rack', () => {
      const { replayDriver, scene, session } = setup();
      session.startNewGame();
      expect(replayDriver.resetVisibility).toHaveBeenCalledWith(scene, 16);
      // rack placement: updateBallPosition called 16 times (one per ball)
      expect(scene.updateBallPosition).toHaveBeenCalledTimes(16);
    });

    it('fires onTurnChanged(0, false) with player 0 on start', () => {
      const { session } = setup();
      const spy = vi.fn();
      session.onTurnChanged = spy;
      session.startNewGame();
      expect(spy).toHaveBeenCalledWith(0, false);
    });

    it('hooks cue.onShotApplied', () => {
      const { cue, session } = setup();
      session.startNewGame();
      expect(cue.onShotApplied).not.toBeNull();
    });
  });

  describe('shot pipeline — SHOT_FIRED + replay', () => {
    it('fires shot → dispatches SHOT_FIRED, disables cue, starts replay watch', () => {
      const { cue, replayDriver, session } = setup();
      session.startNewGame();
      cue.fireShotApplied(noShot());
      expect(session.store.getState().phase).toBe('InShot');
      expect(cue.disable).toHaveBeenCalled();
      expect(replayDriver.watch).toHaveBeenCalledTimes(1);
    });

    it('ignores onShotApplied when not in Aiming phase', () => {
      const { cue, replayDriver } = setup();
      // No startNewGame → phase is MainMenu
      cue.fireShotApplied(noShot());
      expect(replayDriver.watch).not.toHaveBeenCalled();
    });
  });

  describe('verdict: ballInHand (break foul — YouNo4BoardHit)', () => {
    it('calls onTurnChanged(1, true) and enters BallInHand phase', () => {
      const { cue, replayDriver, session } = setup();
      const onTurnChanged = vi.fn();
      session.onTurnChanged = onTurnChanged;
      session.startNewGame();
      cue.fireShotApplied(noShot());
      replayDriver.triggerComplete();
      expect(session.store.getState().phase).toBe('BallInHand');
      expect(onTurnChanged).toHaveBeenCalledWith(1, true);
    });

    it('does NOT call cue.resetForNewTurn during ball-in-hand wait', () => {
      const { cue, replayDriver, session } = setup();
      session.startNewGame();
      // Clear calls from startNewGame() (which legitimately calls resetForNewTurn)
      vi.mocked(cue.resetForNewTurn).mockClear();
      cue.fireShotApplied(noShot());
      replayDriver.triggerComplete();
      // resetForNewTurn must NOT be called on ballInHand path (called later on BALL_PLACED)
      expect(cue.resetForNewTurn).not.toHaveBeenCalled();
    });
  });

  describe('verdict: gameEnded (illegal black pocket on break)', () => {
    it('dispatches to GameOver, fires onGameEnded with winner=1', () => {
      const { cue, replayDriver, session } = setup();
      const onGameEnded = vi.fn();
      session.onGameEnded = onGameEnded;
      session.startNewGame();
      cue.fireShotApplied(blackPocketed());
      replayDriver.triggerComplete();
      expect(session.store.getState().phase).toBe('GameOver');
      expect(session.isGameEnded).toBe(true);
      expect(onGameEnded).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('fires onReasonMessage on game end', () => {
      const { cue, replayDriver, session } = setup();
      const onReason = vi.fn();
      session.onReasonMessage = onReason;
      session.startNewGame();
      cue.fireShotApplied(blackPocketed());
      replayDriver.triggerComplete();
      expect(onReason).toHaveBeenCalled();
      expect(typeof onReason.mock.calls[0][0]).toBe('string');
    });
  });

  describe('verdict: normal turn change (no ball-in-hand)', () => {
    // Requires two shots:
    //   Shot 1: break foul → table opens, player 1 gets ball-in-hand (skip actual placement)
    //   Shot 2 (player 1): hits ball 1, hits 1 rail, no pocket → YouDoNotPocketAnyBall, ballInHand=false
    //
    // We simulate ball placement to exit BallInHand → Aiming before shot 2.

    function doBreakAndSkipBallInHand(
      cue: MockCue,
      replayDriver: MockReplayDriver,
      session: IGameSession,
    ): void {
      session.startNewGame();
      cue.fireShotApplied(noShot());
      replayDriver.triggerComplete();
      // BallInHand phase: simulate ball placement → advance to Aiming
      session.notifyBallPlaced();
    }

    it('calls cue.resetForNewTurn after normal miss', () => {
      const { cue, replayDriver, session } = setup();
      doBreakAndSkipBallInHand(cue, replayDriver, session);
      expect(session.store.getState().phase).toBe('Aiming');

      cue.fireShotApplied(hit1Rail());
      replayDriver.triggerComplete();

      expect(cue.resetForNewTurn).toHaveBeenCalled();
    });

    it('fires onTurnChanged(0, false) — back to player 0, no ball-in-hand', () => {
      const { cue, replayDriver, session } = setup();
      doBreakAndSkipBallInHand(cue, replayDriver, session);

      const onTurnChanged = vi.fn();
      session.onTurnChanged = onTurnChanged;
      cue.fireShotApplied(hit1Rail());
      replayDriver.triggerComplete();

      expect(onTurnChanged).toHaveBeenCalledWith(0, false);
      expect(session.store.getState().phase).toBe('Aiming');
    });
  });

  describe('exitGame()', () => {
    it('disposes replay-driver and removes cue hook', () => {
      const { cue, replayDriver, session } = setup();
      session.startNewGame();
      session.exitGame();
      expect(replayDriver.dispose).toHaveBeenCalled();
      expect(cue.onShotApplied).toBeNull();
      expect(session.store.getState().phase).toBe('MainMenu');
    });
  });

  describe('playAgain()', () => {
    it('resets to Aiming phase, fires onTurnChanged(0, false)', () => {
      const { cue, replayDriver, session, physics } = setup();
      const onTurnChanged = vi.fn();
      session.onTurnChanged = onTurnChanged;

      // Get to GameOver first
      session.startNewGame();
      cue.fireShotApplied(blackPocketed());
      replayDriver.triggerComplete();
      expect(session.store.getState().phase).toBe('GameOver');

      session.playAgain();
      expect(session.store.getState().phase).toBe('Aiming');
      expect(physics.resetToStartState).toHaveBeenCalledTimes(2);
      expect(onTurnChanged).toHaveBeenLastCalledWith(0, false);
    });
  });

  describe('currentPlayerIndex tracking', () => {
    it('starts at 0 and switches to 1 after break foul', () => {
      const { cue, replayDriver, session } = setup();
      session.startNewGame();
      expect(session.currentPlayerIndex).toBe(0);
      cue.fireShotApplied(noShot());
      replayDriver.triggerComplete();
      // Player 1 is now active (BallInHand)
      expect(session.currentPlayerIndex).toBe(1);
    });
  });
});
