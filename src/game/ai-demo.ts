/**
 * P1-T05 CEO demo — AI self-play entry point.
 * URL: ?demo=ai-selfplay [&seed=N] [&r0=N] [&r1=N] [&delay=N]
 *
 * Attaches an AI turn loop to IGameSession by overriding onTurnChanged.
 * Each AI shot is deferred via setTimeout so the render loop can breathe.
 * Caller sets onGameEnded + onReasonMessage for UI; caller calls startNewGame().
 */

import type { IGameSession } from './game-session';
import type { IBallPoolPhysics } from './ball-pool-physics';
import type { CmSpace } from '../physics/cm-space';
import { calculateAIShot } from './ai-controller';

export interface AIDemoConfig {
  seed: number;
  seedFromUrl: boolean; // true = explicit ?seed=N in URL; false = pick via pickValidSeed at startup
  rank0: number;      // P0 AI rank (1–5)
  rank1: number;      // P1 AI rank (1–5); asymmetric (rank0≠rank1) breaks symmetric deadlock
  turnDelayMs: number; // ms between replay completion and next AI shot
}

// seed 4: P0(rank4) legally pots 8-ball → "Player 1 wins! You pocketed the black ball" (clean legal win)
export const AI_DEMO_DEFAULTS: AIDemoConfig = {
  seed: 4,
  seedFromUrl: false,  // default = pick via pickValidSeed
  rank0: 4,
  rank1: 2,
  turnDelayMs: 800,
};

/**
 * Parse demo config from URL search params.
 * Returns null if 'demo' param is absent or not 'ai-selfplay'.
 */
export function parseDemoConfig(params: URLSearchParams): AIDemoConfig | null {
  if (params.get('demo') !== 'ai-selfplay') return null;
  const hasSeed = params.has('seed');
  return {
    seed:        hasSeed ? parseInt(params.get('seed')!, 10) : AI_DEMO_DEFAULTS.seed,
    seedFromUrl: hasSeed,  // false → main.ts replaces seed via pickValidSeed before startNewGame
    rank0:       parseInt(params.get('r0')    ?? String(AI_DEMO_DEFAULTS.rank0),       10),
    rank1:       parseInt(params.get('r1')    ?? String(AI_DEMO_DEFAULTS.rank1),       10),
    turnDelayMs: parseInt(params.get('delay') ?? String(AI_DEMO_DEFAULTS.turnDelayMs), 10),
  };
}

/**
 * Attaches AI self-play to session.onTurnChanged.
 *
 * Flow per turn:
 *   1. onTurnChanged fires (from startNewGame / replay complete / notifyBallPlaced)
 *   2. setTimeout(turnDelayMs) — lets render pipeline settle so CEO sees the board
 *   3. calculateAIShot → forceShot (or place + forceShot for ball-in-hand)
 *   4. Replay runs → onTurnChanged fires again → repeat
 *
 * Ball-in-hand: AI computes cueBallNewPos + shotData together. If cueBallNewPos is set,
 * placeBall then notifyBallPlaced (onTurnChanged suppressed). If null, Unity-faithful
 * in-place shot — do NOT respot (DIV-008 (b); matches BallPoolAIManager:266-269).
 */
export function attachAIDemo(
  session: IGameSession,
  physics: IBallPoolPhysics,
  space: CmSpace,
  config: AIDemoConfig = AI_DEMO_DEFAULTS,
): void {
  const ranks: [number, number] = [config.rank0, config.rank1];
  let shotCount = 0;
  let isFirstShot = true;  // true only for the break shot

  function doShot(ballInHand: boolean): void {
    if (session.isGameEnded) return;
    const playerIdx = session.currentPlayerIndex;
    // Arg order: (isFirstShot, ballInHand) — matches ai-controller signature / self-play.
    // Was swapped (bih, isFirst) from birth (6c087a0); CEO demo saw break-placement on every BIH.
    const result = calculateAIShot(
      space,
      session.getAllowableFn(),
      isFirstShot,
      ballInHand,
      ranks[playerIdx],
      5,  // rankLast (full difficulty ceiling)
      config.seed + shotCount,
    );
    shotCount++;
    isFirstShot = false;

    if (ballInHand) {
      // Suppress onTurnChanged so notifyBallPlaced() doesn't double-schedule the next shot.
      // notifyBallPlaced() calls onTurnChanged internally (phase BallInHand → Aiming),
      // but we want to fire the pre-computed shot directly instead of re-computing.
      const savedCb = session.onTurnChanged;
      session.onTurnChanged = null;

      // Unity: move only when CalculateBestShot found a new position; else in-place shot.
      if (result.cueBallNewPos) {
        physics.placeBall(0, result.cueBallNewPos);
      }
      session.notifyBallPlaced();  // phase: BallInHand → Aiming; onTurnChanged suppressed

      session.onTurnChanged = savedCb;

      // Fire the pre-computed shot after a brief settle delay
      setTimeout(() => {
        if (!session.isGameEnded) session.forceShot(result.shotData);
      }, 200);
    } else {
      session.forceShot(result.shotData);
    }
  }

  session.onTurnChanged = (_playerIdx, ballInHand) => {
    if (session.isGameEnded) return;
    setTimeout(() => doShot(ballInHand), config.turnDelayMs);
  };
}
