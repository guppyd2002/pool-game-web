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

import type { IBallPoolPhysics, ShotData, ShotResult } from './ball-pool-physics';
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
import { BALL_Y, TABLE_Y, MAX_FORCE } from '../physics/constants';
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
 * P1: HotSeat + human-vs-AI via session-external matchMode / attachHumanVsAI
 * (not PlayerGameInfo.IsLocal/IsAI — that identity model remains P2 if needed).
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

  /**
   * SP-Harden-6: both players' 7-slot ball arrays (PlayerBallInfo.balls).
   * 0 = empty/pocketed; 1-7 solid; 9-15 stripe; 8 = black after group clear.
   * Open table → both rows all zeros.
   */
  getPlayerBallSlots(): {
    readonly p0: readonly number[];
    readonly p1: readonly number[];
    readonly t0: BallType;
    readonly t1: BallType;
  };

  /**
   * RULE-006 first tier (ShotTime): foul turn change + ball-in-hand.
   * Only valid in Aiming. UI/timer owns wall-clock; session applies pure rule outcome.
   */
  notifyShotTimeout(): void;

  /**
   * RULE-006 second tier (GameEndTime = 1.5×ShotTime): current player loses.
   * Only valid in Aiming.
   */
  notifyGameEndTimeout(): void;

  /**
   * DATA-001: snapshot for mid-game save (rule + physics strings + phase).
   */
  captureSaveSnapshot(): {
    ruleState: GameLogicStateV1;
    physicsState: string;
    phase: 'Aiming' | 'BallInHand';
    currentPlayerIndex: 0 | 1;
    ballInHand: boolean;
  } | null;

  /**
   * DATA-001: restore physics + rules + FSM from a valid save.
   * Caller must re-sync scene ball meshes after this returns.
   */
  restoreSavedGame(opts: {
    ruleState: GameLogicStateV1;
    physicsState: string;
    phase: 'Aiming' | 'BallInHand';
    currentPlayerIndex: 0 | 1;
    ballInHand: boolean;
  }): void;

  readonly currentPlayerIndex: 0 | 1;
  readonly isGameEnded: boolean;
  readonly isBallInHand: boolean;
  readonly store: GameStore;

  onTurnChanged: ((playerIndex: 0 | 1, ballInHand: boolean) => void) | null;
  onGameEnded: ((winner: 0 | 1 | null, reason: ReasonValue) => void) | null;
  onReasonMessage: ((message: string) => void) | null;
  /** Record hook: fires post-settle (physics + rule engine committed) for each shot. */
  onShotFired: ((shot: RecordedShot) => void) | null;
  /**
   * AUD: real-shot SFX only (not visual re-sim). force01 = impulse/maxForce.
   * Fires once per human/AI applyShot after physics settles.
   */
  onShotAudio: ((result: ShotResult, force01: number) => void) | null;
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

  function _force01FromShot(shot: ShotData | null): number {
    if (!shot) return 0.5;
    const imp = shot.impulse;
    const mag = Math.sqrt(imp.x * imp.x + imp.y * imp.y + imp.z * imp.z);
    return Math.max(0, Math.min(1, mag / MAX_FORCE));
  }

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
  // Re-bind on startNewGame/playAgain: exitGame nulls the hook so menu cannot fire.
  function _bindCueHooks(): void {
    cue.onShotData = (data) => { _pendingHumanShotData = data; };

    cue.onShotApplied = (result) => {
      if (store.getState().phase !== 'Aiming') {
        _pendingHumanShotData = null;  // discard stale — no shot was legally processed
        return;
      }

      ruleEngine.beginShot();
      const verdict = ruleEngine.processShotResult(result);

      // AUD: real-shot SFX (replay re-sim does not call this path again)
      session.onShotAudio?.(result, _force01FromShot(_pendingHumanShotData));

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
  }
  _bindCueHooks();

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
    onShotAudio: null,

    get currentPlayerIndex() { return store.getState().currentPlayerIndex; },
    get isGameEnded() { return store.getState().phase === 'GameOver'; },
    get isBallInHand() { return _ballInHandActive; },
    get store() { return store; },

    startNewGame(): void {
      // Reset physics to canonical start state (GAME-010 rack positions)
      physics.resetToStartState();
      ruleEngine.reset();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      _ballInHandActive = false;
      _shotCounter = 0;
      _lastCueBallPlaced = null;
      store.dispatch({ type: 'EXIT_GAME' });   // force MainMenu so START_GAME gate passes from any phase
      store.dispatch({ type: 'START_GAME' });
      // GAME-003/005: re-bind cue hooks after exitGame null-out
      _bindCueHooks();
      // GAME-014: cue bind id=0 + resetForNewTurn initial state
      cue.resetForNewTurn();
      session.onTurnChanged?.(0, false);
    },

    exitGame(): void {
      replayDriver.dispose();
      // Drop hooks while on MainMenu so stray pointer events cannot fire shots.
      cue.onShotApplied = null;
      cue.onShotData = null;
      _ballInHandActive = false;
      store.dispatch({ type: 'EXIT_GAME' });
    },

    playAgain(): void {
      physics.resetToStartState();
      ruleEngine.reset();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      _ballInHandActive = false;
      store.dispatch({ type: 'PLAY_AGAIN' });
      _bindCueHooks();
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
      session.onShotAudio?.(result, _force01FromShot(shotData));
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

    getPlayerBallSlots() {
      // Snapshot 7-slot arrays for HUD (SP-Harden-6 / BallPool8PlayerUI).
      const p0 = ruleEngine.players[0];
      const p1 = ruleEngine.players[1];
      return {
        p0: [...p0.balls],
        p1: [...p1.balls],
        t0: p0.currentBallType,
        t1: p1.currentBallType,
      };
    },

    notifyShotTimeout(): void {
      // RULE-006 ShotTime: pure rule outcome, no physics/replay
      if (store.getState().phase !== 'Aiming') return;
      const verdict = ruleEngine.applyTimeout();
      const reasonMsg = REASON_MESSAGES[verdict.reason] ?? '';
      // Fabricate REPLAY_DONE without InShot — store only accepts REPLAY_DONE from InShot.
      // Use a synthetic SHOT_FIRED → REPLAY_DONE path with empty replay for timer fouls.
      store.dispatch({ type: 'SHOT_FIRED' });
      store.dispatch({ type: 'REPLAY_DONE', verdict, reasonMessage: reasonMsg });
      _ballInHandActive = verdict.ballInHand;
      if (verdict.ballInHand) trail?.disable();
      cue.disable();
      session.onTurnChanged?.(store.getState().currentPlayerIndex, verdict.ballInHand);
      if (reasonMsg) session.onReasonMessage?.(reasonMsg);
    },

    notifyGameEndTimeout(): void {
      // RULE-006 GameEndTime: force lose
      if (store.getState().phase !== 'Aiming') return;
      const verdict = ruleEngine.applyGameEndTimeout();
      const reasonMsg = REASON_MESSAGES[verdict.reason] ?? '';
      store.dispatch({ type: 'SHOT_FIRED' });
      store.dispatch({ type: 'REPLAY_DONE', verdict, reasonMessage: reasonMsg });
      cue.disable();
      session.onGameEnded?.(verdict.winner, verdict.reason);
      if (reasonMsg) session.onReasonMessage?.(reasonMsg);
    },

    captureSaveSnapshot() {
      const phase = store.getState().phase;
      if (phase !== 'Aiming' && phase !== 'BallInHand') return null;
      return {
        ruleState: ruleEngine.serialize(),
        physicsState: physics.getStateAsString(),
        phase,
        currentPlayerIndex: store.getState().currentPlayerIndex,
        ballInHand: _ballInHandActive || phase === 'BallInHand',
      };
    },

    restoreSavedGame(opts): void {
      physics.setStateFromString(opts.physicsState);
      ruleEngine.deserialize(opts.ruleState);
      _ballInHandActive = opts.ballInHand;
      _shotCounter = 0;
      _lastCueBallPlaced = null;
      _bindCueHooks();
      store.dispatch({
        type: 'RESTORE_GAME',
        playerIndex: opts.currentPlayerIndex,
        phase: opts.ballInHand ? 'BallInHand' : 'Aiming',
      });
      // Sync Three.js ball positions from physics
      const BALL_COUNT = 16;
      for (let id = 0; id < BALL_COUNT; id++) {
        const b = physics.getBall(id);
        if (!b) continue;
        const x = b.position.x / 10000;
        const y = BALL_SCENE_Y;
        const z = b.position.z / 10000;
        scene.updateBallPosition(id, x, y, z);
        const mesh = scene.balls[id];
        if (mesh) {
          // Hide if out / pocketed (velocity zero far from table heuristic via isOutOfTable)
          mesh.visible = !b.isOutOfTable;
        }
      }
      if (opts.ballInHand) {
        trail?.disable();
        cue.disable();
      } else {
        trail?.enable();
        cue.resetForNewTurn();
      }
      session.onTurnChanged?.(opts.currentPlayerIndex, opts.ballInHand);
    },
  };

  return session;
}
