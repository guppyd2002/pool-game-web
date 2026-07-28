/**
 * Headless game simulation — used by pickValidSeed() for CEO demo seed pre-validation.
 *
 * HS-001: seed=4 (r0=4,r1=2) completes with a winner.
 * HS-002: known cap-hit seed under r0=4,r1=2 (ground-truth after 3fa92431).
 * HS-003: pickValidSeed returns a seed that produces a winner.
 *
 * Seed outcomes drift with table/pocket geometry — reconcile to measured reality
 * (SP-Harden-7), never hack AI. DIV-004: cap-hit is symmetry/seed artifact.
 */

import { describe, it, expect } from 'vitest';
import { runHeadlessGame, pickValidSeed } from '../../game/headless-game';

describe('runHeadlessGame()', () => {
  it('HS-001: seed=4 r0=4 r1=2 completes with a winner', () => {
    const result = runHeadlessGame(4, 4, 2);
    expect(result.won).toBe(true);
    expect(result.shots).toBeLessThan(200);
  });

  it('HS-002: seed=7 r0=4 r1=2 cap-hits (no winner within maxShots)', () => {
    // After 3fa92431 corner-pocket shift, seed=0 under r0=4/r1=2 COMPLETES (won=true)
    // — old "seed=0 cap-hit" expectation was stale. Probed seeds 0..29 @ d371b76:
    // cap-hits under 4vs2 = {7, 8, 10}. Use seed=7 as the ground-truth deadlock probe.
    // DIV-004 / [[deterministic-selfplay-symmetry-deadlock]]: do not hack AI.
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
