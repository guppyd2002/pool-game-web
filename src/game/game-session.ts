/**
 * P1-T04 — Game session orchestrator (GAME-018 IGameSession + one-shot loop).
 *
 * Wires three LOCKED modules into an end-to-end game session:
 *   CueController.onShotApplied → ruleEngine.beginShot() + processShotResult()
 *   → GameStore.dispatch(SHOT_FIRED) → ReplayDriver.watch() → onReplayComplete()
 *   → turn change / ball-in-hand / game-over side-effects
 *
 * MUST-FIX compliance:
 *   MF-1: ball-hide is in renderer/replay-driver (not here).
 *   MF-2: no setStateFromString on normal turn change; only placeBall/respotCueBall
 *         for ball-in-hand (handled by BallInHandController in main.ts),
 *         and resetToStartState for new game.
 *
 * Ball-in-hand placement split:
 *   - BallInHandController (main.ts) calls physics.placeBall() — physics + validation layer.
 *   - game-session.notifyBallPlaced() — session state layer (store, trail, cue, callbacks).
 *   - This avoids double physics.placeBall calls.
 */

import type { IBallPoolPhysics, ShotData } from './ball-pool-physics';
import type { CueController } from './cue-controller';
import type { SceneAPI } from '../renderer/scene';
import { createRuleEngine } from './rule-engine';
import type { GameLogicStateV1 } from './rule-engine';
import { BallType } from './player-ball-info';
import { createGameStore } from './game-store';
import type { GameStore } from './game-store';
import type { ReplayDriver } from '../renderer/replay-driver';
import type { BallTrail } from './ball-trail';
import { REASON_MESSAGES } from './game-play-reason';
import type { ReasonValue } from './game-play-reason';
import type { ShotVerdict } from './rule-engine';
import { BALL_Y, TABLE_Y } from '../physics/constants';
import { getAllRackPositions } from './rack-positions';
import { CmVector } from '../physics/cm-vector';

// ─── GAME-018 interface ───────────────────────────────────────────────────────

/**
 * Per-shot record emitted by onShotFired (post-settle, physics + rule-engine committed).
 * Core of the deterministic replay record; checksum covers physics + rule state.
 * shotStartedAt is excluded from checksum (wall-clock only — see GameLogicStateV1:43).
 */
export interface RecordedShot {
  n: number;                        // shot index (0-based, monotonic per game)
  player: 0 | 1;                    // who shot
  shotData: ShotData;               // input impulse/position/torque — what was executed
  cueBallPlaced: CmVector | null;   // ball-in-hand placement (post-settle position), else null
  physicsState: string;             // space.getStateAsString() post-settle
  ruleState: GameLogicStateV1;      // ruleEngine.serialize() post-settle
  checksum: string;                 // computeShotChecksum(physicsState, ruleState)
}

/**
 * Thin abstraction matching C# BallPoolGameManager abstract contract.
 * P1 implements only 8-ball HotSeat. IsLocal/IsAI deferred to P1-T05/P2.
 */
export interface IGameSession {
  startNewGame(): void;
  exitGame(): void;
  playAgain(): void;

  /**
   * GAME-014 ball-in-hand completion: call after BallInHandController.commit() succeeds.
   * Handles session-layer updates (store, trail, cue reset, onTurnChanged).
   * physics.placeBall() is called by BallInHandController, not here.
   */
  notifyBallPlaced(): void;

  /**
   * P1-T05 headless AI shot — mirrors Unity ForceShot path.
   * Calls physics.applyShot(shotData) directly (bypasses cue controller) then runs
   * the same verdict pipeline as cue.onShotApplied. Only valid in Aiming phase.
   */
  forceShot(shotData: ShotData): void;

  /**
   * P1-T05: Returns the allowable-ball predicate for the CURRENT player.
   * Mirrors Unity BallPoolAIManager.CalculateBestShot allowable semantics —
   * group not cleared = can't shoot 8; type not assigned = all object balls allowable.
   * Call right before calculateAIShot() each turn.
   */
  getAllowableFn(): (id: number) => boolean;

  readonly currentPlayerIndex: 0 | 1;
  readonly isGameEnded: boolean;
  readonly isBallInHand: boolean;
  readonly store: GameStore;

  onTurnChanged: ((playerIndex: 0 | 1, ballInHand: boolean) => void) | null;
  onGameEnded: ((winner: 0 | 1 | null, reason: ReasonValue) => void) | null;
  onReasonMessage: ((message: string) => void) | null;
  /** Record hook: fires post-settle (physics + rule engine committed) for each shot. */
  onShotFired: ((shot: RecordedShot) => void) | null;
}

// ─── Checksum ────────────────────────────────────────────────────────────────

/**
 * Compute per-shot state checksum covering BOTH physics and rule-engine state.
 * C-1 requirement: checksum catches rule-state divergence (type-assignment, ballInHand,
 * tableIsOpened, etc.) that physics-only hashing would miss.
 *
 * shotStartedAt is excluded — it is wall-clock only and not part of deterministic state
 * (see GameLogicStateV1 field comment at rule-engine.ts line 43).
 */
export function computeShotChecksum(physicsState: string, ruleState: GameLogicStateV1): string {
  // Omit shotStartedAt from the hash input
  const { shotStartedAt: _, ...deterministicRule } = ruleState;
  const input = physicsState + '\x00' + JSON.stringify(deterministicRule);
  // FNV-1a 32-bit hash — fast, no external dependency, sufficient for determinism check
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface GameSessionDeps {
  physics: IBallPoolPhysics;
  cue: CueController;
  scene: SceneAPI;
  replayDriver: ReplayDriver;
  trail?: BallTrail;  // GAME-013 optional
}

/** Ball height above table surface in Three.js scene units (meters). */
const BALL_SCENE_Y = (BALL_Y - TABLE_Y) / 10000;

export function createBallPool8Session(deps: GameSessionDeps): IGameSession {
  const { physics, cue, scene, replayDriver, trail } = deps;
  const ruleEngine = createRuleEngine();
  const store = createGameStore();

  // ── Ball-in-hand state ────────────────────────────────────────────────────
  let _ballInHandActive = false;

  // ── Record-driver state ───────────────────────────────────────────────────
  let _shotCounter = 0;
  // Cue-ball placement for ball-in-hand shots; set in notifyBallPlaced(), cleared post-record.
  let _lastCueBallPlaced: CmVector | null = null;
  // shotData for human shots; set via cue.onShotData, read in cue.onShotApplied.
  let _pendingHumanShotData: ShotData | null = null;

  /** Compute and emit onShotFired after physics + rule-engine are post-settle. */
  function _emitShotFired(shotData: ShotData): void {
    if (!session.onShotFired) return;
    const physicsState = physics.getStateAsString();
    const ruleState = ruleEngine.serialize();
    const checksum = computeShotChecksum(physicsState, ruleState);
    session.onShotFired({
      n: _shotCounter++,
      player: store.getState().currentPlayerIndex,
      shotData,
      cueBallPlaced: _lastCueBallPlaced,
      physicsState,
      ruleState,
      checksum,
    });
    _lastCueBallPlaced = null;  // consumed
  }

  // ── Hook into cue-controller shot events ─────────────────────────────────
  cue.onShotData = (data) => { _pendingHumanShotData = data; };

  cue.onShotApplied = (result) => {
    if (store.getState().phase !== 'Aiming') {
      _pendingHumanShotData = null;  // discard stale — no shot was legally processed
      return;
    }

    ruleEngine.beginShot();
    const verdict = ruleEngine.processShotResult(result);

    // Post-settle record (physics.applyShot already settled before this callback)
    if (_pendingHumanShotData) {
      _emitShotFired(_pendingHumanShotData);
      _pendingHumanShotData = null;
    }

    store.dispatch({ type: 'SHOT_FIRED' });
    cue.disable();  // no input during replay

    replayDriver.watch(
      physics,
      scene,
      result.pocketed,
      result.outOfTable,
      () => _onReplayComplete(verdict),
    );
  };

  // ── Replay done: apply verdict side-effects ───────────────────────────────
  function _onReplayComplete(verdict: ShotVerdict): void {
    const reasonMsg = REASON_MESSAGES[verdict.reason] ?? '';

    store.dispatch({ type: 'REPLAY_DONE', verdict, reasonMessage: reasonMsg });

    const s = store.getState();

    if (verdict.gameEnded) {
      session.onGameEnded?.(verdict.winner, verdict.reason);
      session.onReasonMessage?.(reasonMsg);
      return;
    }

    if (verdict.ballInHand) {
      // Enter ball-in-hand; cue re-enabled by notifyBallPlaced() after placement
      _ballInHandActive = true;
      trail?.disable();  // GAME-013: no trail while cue ball is in hand
      session.onTurnChanged?.(s.currentPlayerIndex, true);
      session.onReasonMessage?.(reasonMsg);
      return;
    }

    // Normal continuation (same player or turn change — no ball-in-hand)
    cue.resetForNewTurn();  // CUE-020
    session.onTurnChanged?.(s.currentPlayerIndex, false);
    if (reasonMsg) session.onReasonMessage?.(reasonMsg);
  }

  // ── Rack placement: use C# delta positions (GAME-010) ────────────────────
  function _placeRack(): void {
    const positions = getAllRackPositions();
    for (let id = 0; id < positions.length; id++) {
      const { x, z } = positions[id];
      // y = height above table surface (Three.js scene convention, same as physics.placeBall)
      scene.updateBallPosition(id, x / 10000, BALL_SCENE_Y, z / 10000);
      const mesh = scene.balls[id];
      if (mesh) mesh.visible = true;
    }
  }

  // ── IGameSession implementation ───────────────────────────────────────────
  const session: IGameSession = {
    onTurnChanged: null,
    onGameEnded: null,
    onReasonMessage: null,
    onShotFired: null,

    get currentPlayerIndex() { return store.getState().currentPlayerIndex; },
    get isGameEnded() { return store.getState().phase === 'GameOver'; },
    get isBallInHand() { return _ballInHandActive; },
    get store() { return store; },

    startNewGame(): void {
      // Reset physics to canonical start state (GAME-010 rack positions)
      physics.resetToStartState();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      _ballInHandActive = false;
      _shotCounter = 0;
      _lastCueBallPlaced = null;
      store.dispatch({ type: 'START_GAME' });
      // GAME-014: cue bind id=0 + resetForNewTurn initial state
      cue.resetForNewTurn();
      session.onTurnChanged?.(0, false);
    },

    exitGame(): void {
      replayDriver.dispose();
      cue.onShotApplied = null;
      _ballInHandActive = false;
      store.dispatch({ type: 'EXIT_GAME' });
    },

    playAgain(): void {
      physics.resetToStartState();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      _ballInHandActive = false;
      store.dispatch({ type: 'PLAY_AGAIN' });
      // GAME-014: re-init cue state for new game
      cue.resetForNewTurn();
      session.onTurnChanged?.(0, false);
    },

    notifyBallPlaced(): void {
      if (!_ballInHandActive) return;
      // Save cue-ball position for onShotFired (ball-in-hand record)
      _lastCueBallPlaced = physics.getBall(0).position;
      _ballInHandActive = false;
      trail?.enable();  // GAME-013: re-enable trail after placement
      store.dispatch({ type: 'BALL_PLACED' });
      cue.resetForNewTurn();  // CUE-020
      session.onTurnChanged?.(store.getState().currentPlayerIndex, false);
    },

    forceShot(shotData: ShotData): void {
      // P1-T05: AI bypasses cue controller — apply shot directly then run same verdict pipeline.
      if (store.getState().phase !== 'Aiming') return;
      const result = physics.applyShot(shotData);
      ruleEngine.beginShot();
      const verdict = ruleEngine.processShotResult(result);
      // Post-settle record (applyShot is synchronous; physics settled before we reach here).
      // forceShot(game-session:288) passes shotData straight to applyShot — recorded==executed.
      _emitShotFired(shotData);
      store.dispatch({ type: 'SHOT_FIRED' });
      // No cue.disable() — AI never enables cue, so no input to suppress.
      replayDriver.watch(
        physics,
        scene,
        result.pocketed,
        result.outOfTable,
        () => _onReplayComplete(verdict),
      );
    },

    getAllowableFn(): (id: number) => boolean {
      // Mirror Unity _isAllowableBall — derived from current player's group state.
      const player = ruleEngine.players[store.getState().currentPlayerIndex];
      return (ballId: number) => {
        if (ballId === 0) return false;                                     // cue ball
        if (ballId === 8) return player.hasBlackBallToShot;                 // 8-ball only when group cleared
        if (player.hasBlackBallToShot) return false;                        // can only aim at 8
        return player.currentBallType === BallType.Non ||                   // pre-assignment: all ok
               player.isSameBallType(ballId);                               // post-assignment: own group only
      };
    },
  };

  return session;
}
