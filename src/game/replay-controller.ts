/**
 * Replay controller — two clearly-separated modes (must not be mixed).
 *
 * Mode A — Playback: feeds recorded shotData back via session.forceShot.
 *   Fast/stable. Does NOT validate checksums. Used for shot-seek and spectator replay.
 *   headless==rendered invariant is load-bearing: applyShot is synchronous (calculates
 *   _frames[] immediately), render only replays those frames — never re-runs calculate().
 *   Do not move calculate() into the render loop; that would silently break this invariant.
 *
 * Mode B — Determinism CI gate: re-runs from seed via runHeadlessGame, validates
 *   per-shot checksums against a recorded game. ONLY Mode B has checksum authority.
 *   Runs headlessly (no rendering). Use as CI test or dev debug tool.
 */

import type { IGameSession, RecordedShot } from './game-session';
import { createPoolTable } from './table-setup';
import { createBallPoolPhysics } from './ball-pool-physics';
import { createBallPool8Session } from './game-session';
import { calculateAIShot } from './ai-controller';
import type { SceneAPI } from '../renderer/scene';
import type { ReplayDriver } from '../renderer/replay-driver';
import type { CueController } from './cue-controller';

// ─── Shared stub infra (Mode B headless) ─────────────────────────────────────

const _STUB_SCENE = {
  renderer: null, camera: null, get activeCamera() { return null; },
  scene: null, balls: Array.from({ length: 16 }, () => ({ visible: false })),
  table: null,
  updateBallPosition: () => {}, setOrthoTop: () => {}, render: () => {}, dispose: () => {},
} as unknown as SceneAPI;

const _SYNC_REPLAY: ReplayDriver = {
  watch: (_p, _s, _poc, _oot, cb) => { cb(); },
  resetVisibility: () => {},
  dispose: () => {},
};

function _stubCue(): CueController {
  return { onShotApplied: null, onShotData: null, enable: () => {}, disable: () => {}, resetForNewTurn: () => {} } as unknown as CueController;
}

// ─── Mode A: Playback ─────────────────────────────────────────────────────────

export interface PlaybackController {
  /**
   * Attach to a live session. Feeds shots from the record on each onTurnChanged.
   * Call session.startNewGame() after attaching to begin replay.
   * Stops automatically when all shots are fed or game ends.
   */
  attach(session: IGameSession): void;
}

/**
 * Mode A: Feed recorded shots back via session.forceShot.
 * Does NOT re-run AI (uses recorded shotData directly) — no checksum validation.
 * headless==rendered invariant guarantees identical physics output.
 */
export function createPlaybackController(shots: RecordedShot[]): PlaybackController {
  return {
    attach(session: IGameSession): void {
      let idx = 0;

      session.onTurnChanged = (_playerIdx, ballInHand) => {
        if (session.isGameEnded || idx >= shots.length) return;
        const shot = shots[idx++];

        // Ball-in-hand: place cue ball from record, then fire
        if (ballInHand && shot.cueBallPlaced) {
          // Caller must provide the physics reference; use session's internal physics
          // through notifyBallPlaced pathway (placement is recorded as cueBallPlaced).
          // NOTE: in Mode A, ball placement is the recorded position — no AI re-computation.
          // The session caller is responsible for calling physics.placeBall(0, shot.cueBallPlaced)
          // and then notifyBallPlaced() before this onTurnChanged fires.
          // For a fully self-contained playback, use Mode B (re-run from seed).
          session.forceShot(shot.shotData);
        } else {
          session.forceShot(shot.shotData);
        }
      };
    },
  };
}

// ─── Mode B: Determinism CI gate ──────────────────────────────────────────────

export interface DeterminismCheckResult {
  passed: boolean;
  checkedShots: number;
  firstMismatch: number | null;  // shot index where checksum diverges, or null if all match
  details: Array<{ n: number; recorded: string; rerun: string; match: boolean }>;
}

/**
 * Mode B: Re-run game from seed, compare per-shot checksums against recorded game.
 * Uses headless physics (no rendering). Suitable for CI gates and debug divergence tracking.
 *
 * Interpretation:
 *   - All match  → engine is deterministic for this seed+input combination.
 *   - Mismatch at shot N → non-determinism introduced at shot N (or re-run bug).
 *     Inspect the corresponding RecordedShot.physicsState + RecordedShot.ruleState
 *     for the original run's state at that point.
 *
 * IMPORTANT: This mode re-runs AI shot computation. For bit-exact results, the engine
 * version (git SHA) must match the recorded game's `engine` field.
 */
export function runDeterminismCheck(
  record: { shots: RecordedShot[]; config?: { gameSeed?: number; players?: Array<{ type: string; rank?: number }> } },
  options: { r0?: number; r1?: number } = {},
): DeterminismCheckResult {
  const gameSeed = record.config?.gameSeed ?? 0;
  const r0 = options.r0 ?? record.config?.players?.[0]?.rank ?? 4;
  const r1 = options.r1 ?? record.config?.players?.[1]?.rank ?? 2;

  const space = createPoolTable();
  const physics = createBallPoolPhysics(space, _STUB_SCENE);
  const cue = _stubCue();
  const session = createBallPool8Session({ physics, cue, scene: _STUB_SCENE, replayDriver: _SYNC_REPLAY });

  const ranks: [number, number] = [r0, r1];
  let shotCount = 0;
  let isFirstShot = true;
  let pendingBallInHand: boolean | null = null;
  const details: DeterminismCheckResult['details'] = [];

  // Collect rerun checksums by hooking onShotFired
  session.onShotFired = (rerunShot) => {
    const recorded = record.shots[rerunShot.n];
    if (!recorded) return;
    details.push({
      n: rerunShot.n,
      recorded: recorded.checksum,
      rerun: rerunShot.checksum,
      match: rerunShot.checksum === recorded.checksum,
    });
  };

  session.onTurnChanged = (_playerIdx, ballInHand) => {
    if (session.isGameEnded || shotCount >= record.shots.length) return;
    pendingBallInHand = ballInHand;
  };

  session.startNewGame();

  // Non-recursive game loop (mirrors headless-game.ts pattern)
  while (pendingBallInHand !== null && shotCount < record.shots.length && !session.isGameEnded) {
    const ballInHand = pendingBallInHand;
    pendingBallInHand = null;

    const rank = ranks[session.currentPlayerIndex];
    const aiResult = calculateAIShot(
      space,
      session.getAllowableFn(),
      ballInHand,
      isFirstShot,
      rank,
      5,
      gameSeed + shotCount,
    );
    shotCount++;
    isFirstShot = false;

    if (ballInHand) {
      if (aiResult.cueBallNewPos) physics.placeBall(0, aiResult.cueBallNewPos);
      else physics.respotCueBall();
      const savedCb: typeof session.onTurnChanged = session.onTurnChanged;
      session.onTurnChanged = null;
      session.notifyBallPlaced();
      session.onTurnChanged = savedCb;
    }

    if (!session.isGameEnded) {
      session.forceShot(aiResult.shotData);
    }
  }

  const firstMismatch = details.find(d => !d.match)?.n ?? null;
  return {
    passed: firstMismatch === null,
    checkedShots: details.length,
    firstMismatch,
    details,
  };
}
