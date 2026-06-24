/**
 * Headless game simulation — used by pickValidSeed() for CEO demo seed pre-validation.
 *
 * HS-001: seed=4 (r0=4,r1=2) completes with a winner.
 * HS-002: seed=0 (r0=4,r1=2) cap-hits (reaches maxShots without a winner).
 * HS-003: pickValidSeed returns a seed that produces a winner.
 */

import { describe, it, expect } from 'vitest';
import { runHeadlessGame, pickValidSeed } from '../../game/headless-game';

describe('runHeadlessGame()', () => {
  it('HS-001: seed=4 r0=4 r1=2 completes with a winner', () => {
    const result = runHeadlessGame(4, 4, 2);
    expect(result.won).toBe(true);
    expect(result.shots).toBeLessThan(200);
  });

  it('HS-002: seed=0 r0=4 r1=2 cap-hits (no winner within maxShots)', () => {
    const result = runHeadlessGame(0, 4, 2, 200);
    // seed=0 is a known cap-hit / deadlock seed from Playwright scan
    expect(result.won).toBe(false);
  });
});

describe('pickValidSeed()', () => {
  it('HS-003: returns a seed that produces a winner for r0=4 r1=2', () => {
    const seed = pickValidSeed(4, 2, 42);  // deterministic: fixed startSeed
    const result = runHeadlessGame(seed, 4, 2);
    expect(result.won).toBe(true);
  }, 30_000);  // headless sims are fast but allow generous timeout
});
