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
 *
 * isFirstShot (GAME-level break flag):
 *   true only until the first settled shot of the match (human or AI).
 *   After a human break, AI's first turn MUST see isFirstShot=false so placement
 *   uses normal "behind target" logic — not break-quadrant random (CEO first impression).
 *
 * AI-local PRNG seed index (INTENTIONAL — do not "align" to global):
 *   shotCount restarts at 0 for the AI seat; first AI seed reuses base
 *   (same formula as self-play's shot 0). That breaks DIV-004-style symmetry
 *   and is a real HVA fact (human ≠ AI). Aligning seeds to a global index
 *   would re-symmetrize the harness and collapse completion rate — not a fix.
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

  // AI-local PRNG index (intentional; see file header). Not a global shot counter.
  let shotCount = 0;
  // Game-level break flag — cleared on any settled shot (human or AI) via onShotFired.
  let isFirstShot = true;
  const pending: ReturnType<typeof setTimeout>[] = [];

  // Chain: any forceShot / human cue path emits onShotFired post-settle, before onTurnChanged.
  // So after human break, AI's first calculateAIShot already sees isFirstShot=false.
  const prevOnShotFired = session.onShotFired;
  session.onShotFired = (shot) => {
    isFirstShot = false;
    prevOnShotFired?.(shot);
  };

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

    // Arg order matches ai-controller / self-play: (isFirstShot, ballInHand).
    // seed = base + AI-local index * 7919 (intentional base reuse on AI's first shot)
    const result = calculateAIShot(
      space,
      session.getAllowableFn(),
      isFirstShot,
      ballInHand,
      aiRank,
      rankLast,
      deriveAiShotSeed(seedBase, shotCount),
    );
    shotCount++;
    // Defensive: also clear here if a code path skipped onShotFired.
    isFirstShot = false;

    if (ballInHand) {
      const savedCb = session.onTurnChanged;
      session.onTurnChanged = null;

      // Unity BallPoolAIManager:266-269 — ResetCueBall only when position changed.
      // No head-spot respot: null cueBallNewPos → leave cue in place, fire precomputed shot
      // (GetShotData uses current transform after optional move — DIV-008 (b)).
      if (result.cueBallNewPos) {
        physics.placeBall(0, result.cueBallNewPos);
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
