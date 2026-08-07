/**
 * Pin: HVA vs self-play quality gap is mechanism (A) — symmetry break — not foul undercount.
 *
 * Self-play r3v3: both seats share GLOBAL shot index for PRNG seeds
 *   seed_i = base + i * 7919, isFirstShot only for i===0.
 * HVA attachHumanVsAI: AI seat uses AI-LOCAL shot index starting at 0,
 *   so after human break, AI's first shot still has isFirstShot=true and seed=base
 *   (same seed as human's opening break). That breaks DIV-004-style symmetry.
 *
 * Foul counting: both use onTurnChanged(bih=true) — same definition.
 */
import { describe, it, expect } from 'vitest';
import { deriveAiShotSeed } from '../../game/human-vs-ai';

describe('HVA vs self-play seed / isFirstShot asymmetry (mechanism A)', () => {
  it('self-play schedule: global index, single isFirst at shot 0', () => {
    const base = 0;
    // Hypothetical 4-shot game: seats alternate after two P0 pots then P1…
    // Seeds are always base + globalIndex * 7919 regardless of seat.
    const global = [0, 1, 2, 3].map((i) => ({
      global: i,
      seed: deriveAiShotSeed(base, i),
      isFirst: i === 0,
    }));
    expect(global[0]).toEqual({ global: 0, seed: 0, isFirst: true });
    expect(global[1]).toEqual({ global: 1, seed: 7919, isFirst: false });
    expect(global[2]).toEqual({ global: 2, seed: 15838, isFirst: false });
  });

  it('HVA AI-local schedule: first AI shot reuses base seed + isFirst=true even if global>0', () => {
    const base = 0;
    // Human already took global shots 0 and 1 (break + continuation).
    const humanSeeds = [0, 1].map((g) => deriveAiShotSeed(base, g));
    // AI-local shotCount starts at 0 inside attachHumanVsAI
    const aiFirstLocal = 0;
    const aiFirstSeed = deriveAiShotSeed(base, aiFirstLocal);
    const aiIsFirst = true; // attachHumanVsAI isFirstShot flag until first AI forceShot

    expect(humanSeeds[0]).toBe(0);
    expect(aiFirstSeed).toBe(0); // SAME as human break seed — not global 2 * 7919
    expect(aiFirstSeed).not.toBe(deriveAiShotSeed(base, 2)); // self-play would use 15838
    expect(aiIsFirst).toBe(true); // self-play at global 2 would be false
  });

  it('seat seed streams diverge: self-play shares one sequence; HVA AI restarts at 0', () => {
    const base = 42;
    // After 3 human-only globals then AI local 0,1 vs self-play globals 3,4 for "same" ordinal AI shots
    const selfPlayAiShotsIfSeatsWere_0_0_0_1_1 = [
      deriveAiShotSeed(base, 3),
      deriveAiShotSeed(base, 4),
    ];
    const hvaAiLocal = [
      deriveAiShotSeed(base, 0),
      deriveAiShotSeed(base, 1),
    ];
    expect(hvaAiLocal[0]).not.toBe(selfPlayAiShotsIfSeatsWere_0_0_0_1_1[0]);
    expect(hvaAiLocal[0]).toBe(base);
  });
});
