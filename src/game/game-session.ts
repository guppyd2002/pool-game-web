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
 *         for ball-in-hand, and resetToStartState for new game.
 */

import type { IBallPoolPhysics } from './ball-pool-physics';
import type { CueController } from './cue-controller';
import type { SceneAPI } from '../renderer/scene';
import { createRuleEngine } from './rule-engine';
import { createGameStore } from './game-store';
import type { GameStore } from './game-store';
import type { ReplayDriver } from '../renderer/replay-driver';
import type { BallTrail } from './ball-trail';
import { REASON_MESSAGES } from './game-play-reason';
import type { ReasonValue } from './game-play-reason';
import type { ShotVerdict } from './rule-engine';
import { BALL_Y } from '../physics/constants';
import { CmVector } from '../physics/cm-vector';
import { getAllRackPositions } from './rack-positions';

// ─── GAME-018 interface ───────────────────────────────────────────────────────

/**
 * Thin abstraction matching C# BallPoolGameManager abstract contract.
 * P1 implements only 8-ball HotSeat. IsLocal/IsAI deferred to P1-T05/P2.
 */
export interface IGameSession {
  startNewGame(): void;
  exitGame(): void;
  playAgain(): void;
  readonly currentPlayerIndex: 0 | 1;
  readonly isGameEnded: boolean;
  readonly store: GameStore;

  onTurnChanged: ((playerIndex: 0 | 1, ballInHand: boolean) => void) | null;
  onGameEnded: ((winner: 0 | 1 | null, reason: ReasonValue) => void) | null;
  onReasonMessage: ((message: string) => void) | null;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export interface GameSessionDeps {
  physics: IBallPoolPhysics;
  cue: CueController;
  scene: SceneAPI;
  replayDriver: ReplayDriver;
  trail?: BallTrail;  // GAME-013 optional
}

export function createBallPool8Session(deps: GameSessionDeps): IGameSession {
  const { physics, cue, scene, replayDriver, trail } = deps;
  const ruleEngine = createRuleEngine();
  const store = createGameStore();

  // ── Ball-in-hand state ────────────────────────────────────────────────────
  let _ballInHandActive = false;

  // ── Hook into cue-controller shot events ─────────────────────────────────
  cue.onShotApplied = (result) => {
    if (store.getState().phase !== 'Aiming') return;

    ruleEngine.beginShot();
    const verdict = ruleEngine.processShotResult(result);

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
      // C# CueBallMoveManager: enter ball-in-hand for the new current player
      _enterBallInHand();
      session.onTurnChanged?.(s.currentPlayerIndex, true);
      session.onReasonMessage?.(reasonMsg);
      return;
    }

    // Normal continuation (same player or turn change — no ball-in-hand)
    cue.resetForNewTurn();  // CUE-020
    session.onTurnChanged?.(s.currentPlayerIndex, false);
    if (reasonMsg) session.onReasonMessage?.(reasonMsg);
  }

  // ── Ball-in-hand helpers (G5 seam: physics.placeBall / respotCueBall) ────
  function _enterBallInHand(): void {
    _ballInHandActive = true;
    trail?.disable();  // GAME-013: no trail while cue ball is in hand
  }

  function _commitBallInHand(x: number, z: number): void {
    if (!_ballInHandActive) return;
    _ballInHandActive = false;
    // G5 seam: place cue ball at player-chosen position
    physics.placeBall(0, new CmVector(
      Math.trunc(x * 10000),
      BALL_Y,
      Math.trunc(z * 10000),
    ));
    trail?.enable();  // GAME-013: re-enable trail after placement
    store.dispatch({ type: 'BALL_PLACED' });
    const s = store.getState();
    cue.resetForNewTurn();  // CUE-020
    session.onTurnChanged?.(s.currentPlayerIndex, false);
  }

  // Exposed for main.ts ball-in-hand pointer handler
  (physics as unknown as Record<string, unknown>).__commitBallInHand = _commitBallInHand;

  // ── Rack placement: use C# delta positions (GAME-010) ────────────────────
  function _placeRack(): void {
    const positions = getAllRackPositions();
    for (let id = 0; id < positions.length; id++) {
      const { x, z } = positions[id];
      scene.updateBallPosition(id, x / 10000, BALL_Y / 10000, z / 10000);
      const mesh = scene.balls[id];
      if (mesh) mesh.visible = true;
    }
  }

  // ── IGameSession implementation ───────────────────────────────────────────
  const session: IGameSession = {
    onTurnChanged: null,
    onGameEnded: null,
    onReasonMessage: null,

    get currentPlayerIndex() { return store.getState().currentPlayerIndex; },
    get isGameEnded() { return store.getState().phase === 'GameOver'; },
    get store() { return store; },

    startNewGame(): void {
      // Reset physics to canonical start state
      physics.resetToStartState();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      // Reset rule engine by creating fresh one
      // (we use the outer ruleEngine binding — reset indirectly via new game dispatch)
      store.dispatch({ type: 'START_GAME' });
      cue.resetForNewTurn();
      session.onTurnChanged?.(0, false);
    },

    exitGame(): void {
      replayDriver.dispose();
      cue.onShotApplied = null;
      store.dispatch({ type: 'EXIT_GAME' });
    },

    playAgain(): void {
      physics.resetToStartState();
      replayDriver.resetVisibility(scene, 16);
      _placeRack();
      store.dispatch({ type: 'PLAY_AGAIN' });
      cue.resetForNewTurn();
      session.onTurnChanged?.(0, false);
    },
  };

  return session;
}
