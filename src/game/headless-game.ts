/**
 * Headless game simulation — runs a full AI vs AI game without any Three.js rendering.
 * Used by pickValidSeed() to pre-validate demo seeds before page load commits to one.
 *
 * Architecture:
 *   - createPoolTable() → real CmSpace (pure TS, no Three.js)
 *   - createBallPoolPhysics(space, stubScene) — renderer is only used in the RAF loop,
 *     never inside applyShot(); stub no-ops are safe.
 *   - Synchronous ReplayDriver fires cb() immediately (no requestAnimationFrame).
 *   - Non-recursive loop: onTurnChanged sets pendingBallInHand, while-loop picks it up.
 */

import { createPoolTable } from './table-setup';
import { createBallPoolPhysics } from './ball-pool-physics';
import { createBallPool8Session } from './game-session';
import { calculateAIShot } from './ai-controller';
import type { SceneAPI } from '../renderer/scene';
import type { ReplayDriver } from '../renderer/replay-driver';
import type { CueController } from './cue-controller';

// Stub scene: updateBallPosition is called by placeBall() and _placeRack(); all no-ops.
// scene.balls[id].visible is set in _placeRack(); stubs satisfy the if-guard.
const _STUB_SCENE = {
  renderer: null,
  camera: null,
  get activeCamera() { return null; },
  scene: null,
  balls: Array.from({ length: 16 }, () => ({ visible: false })),
  table: null,
  updateBallPosition: () => {},
  setOrthoTop: () => {},
  render: () => {},
  dispose: () => {},
} as unknown as SceneAPI;

// Stub cue: game-session sets onShotApplied and calls resetForNewTurn; all no-ops.
function _makeStubCue(): CueController {
  return {
    onShotApplied: null,
    enable: () => {},
    disable: () => {},
    resetForNewTurn: () => {},
  } as unknown as CueController;
}

// Synchronous replay driver: fires cb() immediately so the while-loop drives the game.
const _SYNC_REPLAY_DRIVER: ReplayDriver = {
  watch: (_p, _s, _poc, _oot, cb) => { cb(); },
  resetVisibility: () => {},
  dispose: () => {},
};

export interface HeadlessResult {
  /** True if the game ended with a winner (any win — legal or foul). */
  won: boolean;
  /** Number of AI shots fired. */
  shots: number;
}

/**
 * Run a complete AI vs AI 8-ball game without rendering.
 * Returns early with won=false if maxShots is reached (cap-hit / deadlock seed).
 *
 * @param seed  Starting PRNG seed (incremented per shot, same as attachAIDemo).
 * @param r0    Player 0 AI rank (1–5).
 * @param r1    Player 1 AI rank (1–5).
 * @param maxShots  Cap at this many shots before declaring cap-hit (default 200).
 */
export function runHeadlessGame(seed: number, r0: number, r1: number, maxShots = 200): HeadlessResult {
  const space = createPoolTable();
  // Stub renderer: applyShot never calls renderer; only the RAF loop does (not started here).
  const physics = createBallPoolPhysics(space, _STUB_SCENE);
  const cue = _makeStubCue();
  const session = createBallPool8Session({ physics, cue, scene: _STUB_SCENE, replayDriver: _SYNC_REPLAY_DRIVER });

  const ranks: [number, number] = [r0, r1];
  let shotCount = 0;
  let isFirstShot = true;
  let won = false;
  let pendingBallInHand: boolean | null = null;

  session.onGameEnded = () => { won = true; };

  // Non-recursive: sets pendingBallInHand for the while-loop to consume.
  session.onTurnChanged = (_playerIdx, ballInHand) => {
    if (session.isGameEnded || shotCount >= maxShots) return;
    pendingBallInHand = ballInHand;
  };

  session.startNewGame();
  // startNewGame fires onTurnChanged(0, false) → pendingBallInHand = false

  while (pendingBallInHand !== null && shotCount < maxShots && !session.isGameEnded) {
    const ballInHand = pendingBallInHand;
    pendingBallInHand = null;  // clear; forceShot will re-set via sync replay driver → onTurnChanged

    const rank = ranks[session.currentPlayerIndex];
    const aiResult = calculateAIShot(
      space,
      session.getAllowableFn(),
      ballInHand,
      isFirstShot,
      rank,
      5,  // rankLast — full difficulty ceiling
      seed + shotCount,
    );
    shotCount++;
    isFirstShot = false;

    if (ballInHand) {
      // Place cue ball via AI's computed position; suppress onTurnChanged during
      // notifyBallPlaced() to avoid double-scheduling (mirrors attachAIDemo pattern).
      if (aiResult.cueBallNewPos) physics.placeBall(0, aiResult.cueBallNewPos);
      else physics.respotCueBall();

      const savedCb: typeof session.onTurnChanged = session.onTurnChanged;
      session.onTurnChanged = null;
      session.notifyBallPlaced();  // BallInHand → Aiming; onTurnChanged suppressed
      session.onTurnChanged = savedCb;
    }

    // forceShot → applyShot (real physics) → sync replayDriver → _onReplayComplete
    // → onTurnChanged → pendingBallInHand = nextTurn (or won=true if game ended)
    if (!session.isGameEnded) {
      session.forceShot(aiResult.shotData);
    }
  }

  return { won, shots: shotCount };
}

/**
 * Find a seed that produces a complete game (has a winner, not a deadlock cap-hit).
 * Tries up to 15 candidates spread around startSeed; falls back to seed=4 if all fail.
 *
 * @param r0        Player 0 AI rank.
 * @param r1        Player 1 AI rank.
 * @param startSeed Base seed to spread from (use Math.random() * 10000 for randomness).
 */
export function pickValidSeed(r0: number, r1: number, startSeed: number): number {
  for (let i = 0; i < 15; i++) {
    const candidate = Math.floor((startSeed + i * 97) % 10000);  // 97 prime → good spread
    if (runHeadlessGame(candidate, r0, r1).won) return candidate;
  }
  return 4;  // seed=4 verified legal win: "Player 1 wins! You pocketed the black ball"
}
