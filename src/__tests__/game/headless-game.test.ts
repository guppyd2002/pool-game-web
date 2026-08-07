/**
 * Headless game simulation — used by pickValidSeed() for CEO demo seed pre-validation.
 *
 * HS-001: seed=4 (r0=4,r1=2) completes with a winner.
 * HS-002: DIV-004 mechanism direction (QA ground truth @72c54f5) — see test body.
 * HS-003: pickValidSeed returns a seed that produces a winner.
 *
 * Seed formulas are NOT interchangeable:
 *   - headless / demo production: seed + shotCount
 *   - SP-004 / REC-1: seed + shotIndex * 7919
 * See tests/fixtures/ai-quality/README.md (three rulers).
 */

import { describe, it, expect } from 'vitest';
import { runHeadlessGame, pickValidSeed } from '../../game/headless-game';
import { createPoolTable } from '../../game/table-setup';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import { createBallPool8Session } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import type { CueController } from '../../game/cue-controller';

const MAX_SHOTS = 200;
const SEED_LO = 0;
const SEED_HI = 49; // inclusive → N=50, matches QA sample

const MOCK_SCENE = {
  updateBallPosition: () => {},
  render: () => {},
  dispose: () => {},
  renderer: null as unknown as import('three').WebGLRenderer,
  camera: null as unknown as import('three').PerspectiveCamera,
  scene: null as unknown as import('three').Scene,
  balls: [] as unknown as import('three').Mesh[],
  table: null as unknown as import('three').Group,
  activeCamera: null as unknown as import('three').Camera,
  setOrthoTop: () => {},
} as unknown as SceneAPI;

const MOCK_CUE = {
  get onShotApplied() { return null; },
  set onShotApplied(_fn: unknown) {},
  disable: () => {},
  enable: () => {},
  resetForNewTurn: () => {},
  cancel: () => {},
  get phase() { return 'idle' as const; },
  get isEnabled() { return false; },
  get aimLineVisible() { return false; },
  onDragStart: () => {},
  onDragMove: () => {},
  onDragEnd: () => false,
  fireNow: () => false,
  getPowerFraction: () => 0,
  getAimHit: () => null,
  hasEnergy: () => false,
  dragDistToForce: () => 0,
  setSpinOffset: () => {},
  getSpinOffset: () => ({ x: 0, y: 0 }),
  setVerticalAngle: () => {},
  getVerticalAngle: () => 0,
  toggleAimLine: () => {},
  getAimState: () => ({ start: null, current: null }),
  setFineAimCurrent: () => {},
} as unknown as CueController;

const SYNC_REPLAY: ReplayDriver = {
  watch(_p, _s, _a, _b, done) { done(); },
  resetVisibility: () => {},
  dispose: () => {},
};

/**
 * SP-004 / REC-1 faithful loop (ruler B):
 *   seed + shotIndex * 7919, NO respot on null placement, production table factory.
 * Used only for the symmetric mechanism assertion — not for demo/prod numbers.
 */
function runSp004Style(seed: number, rank0: number, rank1: number, rankLast = 5): { won: boolean; shots: number; capHit: boolean } {
  const space = createPoolTable();
  const physics = createBallPoolPhysics(space, MOCK_SCENE);
  const session = createBallPool8Session({
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: SYNC_REPLAY,
  });
  let gameEnded = false;
  let shotCount = 0;
  session.onGameEnded = () => { gameEnded = true; };
  session.startNewGame();
  while (!gameEnded && shotCount < MAX_SHOTS) {
    const bih = session.isBallInHand;
    const rank = session.currentPlayerIndex === 0 ? rank0 : rank1;
    const ai = calculateAIShot(
      space,
      session.getAllowableFn(),
      shotCount === 0,
      bih,
      rank,
      rankLast,
      seed + shotCount * 7919,
    );
    // SP-004: place only when AI returns a position — no respotCueBall fallback
    if (bih) {
      if (ai.cueBallNewPos !== null) physics.placeBall(0, ai.cueBallNewPos);
      session.notifyBallPlaced();
    }
    session.forceShot(ai.shotData);
    shotCount++;
  }
  const capHit = shotCount >= MAX_SHOTS && !gameEnded;
  return { won: gameEnded, shots: shotCount, capHit };
}

describe('runHeadlessGame()', () => {
  it('HS-001: seed=4 r0=4 r1=2 completes with a winner', () => {
    const result = runHeadlessGame(4, 4, 2);
    expect(result.won).toBe(true);
    expect(result.shots).toBeLessThan(200);
  });

  /**
   * HS-002 — INTENTIONALLY RED until QA re-measures on post-DIV-008(b) tree.
   *
   * History of false "mechanism" goldens (do not re-introduce):
   *   1) d371b76: cap seeds {7,8,10} measured under SWAPPED headless AI args.
   *   2) 72c54f5 / 11638b7: asymmetric r4v2 seed+shot "cap===0" was measured while
   *      headless still RESPOTTED on null placement — i.e. ruler A with safety net,
   *      NOT SP-004 ruler B. After DIV-008 (b) @7b7620c (no respot), that absolute
   *      zero is no longer valid on headless seed+shot (observed ~35% cap N=20).
   *
   * Required rewrite (dev MUST NOT invent numbers — wait 卡卡西 on 7b7620c+):
   *   - Measure ONLY on committed no-respot harness (SP-004 / *7919 ruler B)
   *   - Assert directional: symmetric cap-hit rate > asymmetric cap-hit rate
   *     (same seed formula both sides; reference was ~45% sym r4 vs ~20% asym SP-005)
   *   - ❌ single-seed fate  ❌ fixed percent like 4% or 0%
   *
   * Until QA lands, keep the obsolete expect so CI stays red (honest).
   */
  it('HS-002: STALE respot-ON asymmetric zero-cap (leave red — wait QA on SP-004 ruler)', () => {
    // STALE: absolute zero on headless seed+shot was respot-inflated @72c54f5.
    // After (b) this fails. Do not "fix" by lowering the number — change the RULER.
    let caps = 0;
    for (let seed = SEED_LO; seed <= SEED_HI; seed++) {
      const r = runHeadlessGame(seed, 4, 2, MAX_SHOTS);
      if (!r.won || r.shots >= MAX_SHOTS) caps++;
    }
    expect(caps).toBe(0);
  }, 180_000);

  it('HS-002b: symmetric r4v4 (*7919 SP-004) completion < 100% over seeds 0..49', () => {
    // Ruler B (always no-respot) — still valid directional sanity: not always completes.
    // Full sym vs asym comparison awaits QA post-(b) numbers on this same ruler.
    let completed = 0;
    const n = SEED_HI - SEED_LO + 1;
    for (let seed = SEED_LO; seed <= SEED_HI; seed++) {
      const r = runSp004Style(seed, 4, 4);
      if (r.won && !r.capHit) completed++;
    }
    expect(completed).toBeLessThan(n);
    expect(completed).toBeGreaterThan(0);
  }, 300_000);
});


describe('pickValidSeed()', () => {
  it('HS-003: returns a seed that produces a winner for r0=4 r1=2', () => {
    const seed = pickValidSeed(4, 2, 42);  // deterministic: fixed startSeed
    const result = runHeadlessGame(seed, 4, 2);
    expect(result.won).toBe(true);
  }, 30_000);
});
