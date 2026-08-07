/**
 * Headless game simulation — used by pickValidSeed() for CEO demo seed pre-validation.
 *
 * HS-001: seed=4 (r0=4,r1=2) completes with a winner.
 * HS-002: INTENTIONALLY RED until QA rewrites (see test body). Do NOT "fix green"
 *         by swapping magic seeds — old expectation was bug-derived.
 * HS-003: pickValidSeed returns a seed that produces a winner.
 *
 * Seed outcomes drift with table/pocket geometry — reconcile to measured reality
 * (SP-Harden-7), never hack AI. DIV-004: symmetric deadlock is the real claim;
 * asymmetric completion is expected. Headless uses seed+shotCount (not *7919).
 */

import { describe, it, expect } from 'vitest';
import { runHeadlessGame, pickValidSeed } from '../../game/headless-game';

describe('runHeadlessGame()', () => {
  it('HS-001: seed=4 r0=4 r1=2 completes with a winner', () => {
    const result = runHeadlessGame(4, 4, 2);
    expect(result.won).toBe(true);
    expect(result.shots).toBeLessThan(200);
  });

  /**
   * HS-002 — STALE / BUG-DERIVED EXPECTATION (leave red; do not retune magic seeds).
   *
   * History:
   *   - d371b76: probed r4v2 seeds 0..29 → cap-hits {7,8,10}; seed=7 chosen as probe.
   *     That probe ran while calculateAIShot args were SWAPPED in headless-game
   *     (bih, isFirst) — i.e. ground truth was measured on the false AI.
   *   - 9b3a170: arg order fixed to (isFirstShot, ballInHand). Under correct AI,
   *     seed=7 r4v2 COMPLETES (won=true, ~23 shots); r4v2 0..50 → zero caps.
   *
   * Planned rewrite (await pool-qa independent ground truth — dev must NOT invent
   * thresholds): assert DIV-004 mechanism —
   *   symmetric config has substantial cap-hit band;
   *   asymmetric config significantly lower / zero.
   * Not: "this one seed still deadlocks."
   */
  it('HS-002: seed=7 r0=4 r1=2 cap-hits (no winner within maxShots)', () => {
    // BUG-DERIVED @ d371b76 (false-AI headless). Fixed AI @ 9b3a170 → this fails.
    // Intentionally not updated: red is honest until QA supplies mechanism bands.
    const result = runHeadlessGame(7, 4, 2, 200);
    expect(result.won).toBe(false);
    expect(result.shots).toBe(200);
  });
});

describe('pickValidSeed()', () => {
  it('HS-003: returns a seed that produces a winner for r0=4 r1=2', () => {
    const seed = pickValidSeed(4, 2, 42);  // deterministic: fixed startSeed
    const result = runHeadlessGame(seed, 4, 2);
    expect(result.won).toBe(true);
  }, 30_000);  // headless sims are fast but allow generous timeout
});
