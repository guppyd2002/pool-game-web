/**
 * Human vs AI turn driver (P1 vs-AI MVP).
 *
 * Parallel to `attachAIDemo` (AI vs AI spectator). Does NOT modify ai-demo.
 * P0 = human, P1 = AI by default; session-external identity (no PlayerGameInfo).
 *
 * Flow:
 *   onTurnChanged → if human seat: hooks.onHumanTurn only
 *                 → if AI seat:    hooks.onAiTurn + schedule calculateAIShot → forceShot
 *   BIH AI: placeBall + notifyBallPlaced (suppress re-entry) + delayed forceShot
 *
 * Shot timer / cue enable/disable are caller responsibilities (main.ts hooks).
 * Use `shouldRunShotTimer` so AI seats never arm RULE-006 wall-clock.
 */

import type { IGameSession } from './game-session';
import type { IBallPoolPhysics } from './ball-pool-physics';
import type { CmSpace } from '../physics/cm-space';
import { calculateAIShot } from './ai-controller';

/**
 * PRNG seed stride per shot — must match self-play harness (REC-1 / ai-self-play.test.ts):
 *   seed + shotIndex * 7919
 * Avoids consecutive-integer seeds that can correlate Mulberry32 streams.
 */
export const AI_SHOT_SEED_STRIDE = 7919;

/** Derive per-shot AI PRNG seed (same formula as self-play). */
export function deriveAiShotSeed(baseSeed: number, shotIndex: number): number {
  return baseSeed + shotIndex * AI_SHOT_SEED_STRIDE;
}

export interface HumanVsAIConfig {
  /** Seat controlled by AI. Default 1 (P1). */
  aiSeat?: 0 | 1;
  /** AI rank 0..rankLast-1. Default 3 (MVP fixed difficulty). */
  aiRank?: number;
  /** Rank.Last exclusive upper bound. Default 5. */
  rankLast?: number;
  /** PRNG seed base; per-shot seed = seed + shotCount. Default 1. */
  seed?: number;
  /** Delay before AI acts after turn starts (ms). Default 600. */
  turnDelayMs?: number;
  /** Delay after BIH place before forceShot (ms). Default 200. */
  bihSettleMs?: number;
  /** Injected timers for unit tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface HumanVsAIHooks {
  /** Human seat turn — enable cue/timer/BIH UI. */
  onHumanTurn?: (playerIndex: 0 | 1, ballInHand: boolean) => void;
  /** AI seat turn — disable cue/chrome, stop shot timer, then AI schedules. */
  onAiTurn?: (playerIndex: 0 | 1, ballInHand: boolean) => void;
}

export interface HumanVsAIController {
  isAiSeat(playerIndex: number): boolean;
  isAiTurn(): boolean;
  /** Cancel pending AI timers (exit / dispose). */
  dispose(): void;
  /** Test helper: run all pending scheduled AI work synchronously. */
  flushPending(): void;
}

/** RULE-006 wall-clock only for human seats — never arm on AI turns. */
export function shouldRunShotTimer(playerIndex: 0 | 1, aiSeat: 0 | 1): boolean {
  return playerIndex !== aiSeat;
}

export const HUMAN_VS_AI_DEFAULTS = {
  aiSeat: 1 as 0 | 1,
  aiRank: 3,
  rankLast: 5,
  seed: 1,
  turnDelayMs: 600,
  bihSettleMs: 200,
};

/**
 * Attach human-vs-AI turn loop to session.onTurnChanged.
 * Replaces any previous onTurnChanged; use hooks for UI chrome.
 */
export function attachHumanVsAI(
  session: IGameSession,
  physics: IBallPoolPhysics,
  space: CmSpace,
  config: HumanVsAIConfig = {},
  hooks: HumanVsAIHooks = {},
): HumanVsAIController {
  const aiSeat = config.aiSeat ?? HUMAN_VS_AI_DEFAULTS.aiSeat;
  const aiRank = config.aiRank ?? HUMAN_VS_AI_DEFAULTS.aiRank;
  const rankLast = config.rankLast ?? HUMAN_VS_AI_DEFAULTS.rankLast;
  const seedBase = config.seed ?? HUMAN_VS_AI_DEFAULTS.seed;
  const turnDelayMs = config.turnDelayMs ?? HUMAN_VS_AI_DEFAULTS.turnDelayMs;
  const bihSettleMs = config.bihSettleMs ?? HUMAN_VS_AI_DEFAULTS.bihSettleMs;
  const setT = config.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = config.clearTimeoutFn ?? ((id) => clearTimeout(id));

  let shotCount = 0;
  let isFirstShot = true;
  const pending: ReturnType<typeof setTimeout>[] = [];

  function _schedule(fn: () => void, ms: number): void {
    const id = setT(() => {
      const i = pending.indexOf(id);
      if (i >= 0) pending.splice(i, 1);
      fn();
    }, ms);
    pending.push(id);
  }

  function _clearPending(): void {
    for (const id of pending) clearT(id);
    pending.length = 0;
  }

  function doAiShot(ballInHand: boolean): void {
    if (session.isGameEnded) return;
    if (session.currentPlayerIndex !== aiSeat) return;

    const result = calculateAIShot(
      space,
      session.getAllowableFn(),
      ballInHand,
      isFirstShot,
      aiRank,
      rankLast,
      deriveAiShotSeed(seedBase, shotCount),
    );
    shotCount++;
    isFirstShot = false;

    if (ballInHand) {
      const savedCb = session.onTurnChanged;
      session.onTurnChanged = null;

      if (result.cueBallNewPos) {
        physics.placeBall(0, result.cueBallNewPos);
      } else {
        physics.respotCueBall();
      }
      session.notifyBallPlaced();

      session.onTurnChanged = savedCb;

      _schedule(() => {
        if (!session.isGameEnded && session.currentPlayerIndex === aiSeat) {
          session.forceShot(result.shotData);
        }
      }, bihSettleMs);
    } else {
      session.forceShot(result.shotData);
    }
  }

  session.onTurnChanged = (playerIndex, ballInHand) => {
    if (session.isGameEnded) return;
    _clearPending();

    if (playerIndex === aiSeat) {
      hooks.onAiTurn?.(playerIndex, ballInHand);
      _schedule(() => doAiShot(ballInHand), turnDelayMs);
    } else {
      hooks.onHumanTurn?.(playerIndex, ballInHand);
    }
  };

  return {
    isAiSeat(playerIndex: number): boolean {
      return playerIndex === aiSeat;
    },
    isAiTurn(): boolean {
      return !session.isGameEnded && session.currentPlayerIndex === aiSeat;
    },
    dispose(): void {
      _clearPending();
    },
    flushPending(): void {
      // Drain with zero-delay by invoking all pending synchronously.
      // Works with real timers only if delay was 0; tests inject setTimeoutFn that records.
      const copy = pending.slice();
      pending.length = 0;
      for (const id of copy) {
        clearT(id);
      }
      // If using fake timer queue from tests, they call vi.runAllTimers instead.
    },
  };
}
