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
   * HS-002 — DIV-004 mechanism direction (not magic seeds / not a fixed %).
   *
   * History (do not re-introduce bug-derived goldens):
   *   - d371b76: old "ground truth" cap seeds {7,8,10} under r4v2 were measured while
   *     headless calculateAIShot args were SWAPPED (false AI). Bug-derived.
   *   - 9b3a170: arg order fixed (isFirstShot, ballInHand).
   *   - 72c54f5: QA (卡卡西) independent N=50 ground truth — NOT self-certified by dev.
   *
   * Assertions (QA-specified; do not invent alternatives):
   *   ✅ asymmetric r4v2, seed+shot, seeds 0..49 → cap-hit === 0
   *   ✅ symmetric r4v4, *7919, same seed range → completion < 100% (symmetric can deadlock)
   *   ❌ never assert a single seed's fate
   *   ❌ never assert cap-hit rate == 4% (fragile on seed set)
   *
   * DIV-004 disposition (fleet): "low self-play completion is expected / not a FAIL"
   * is withdrawn as a blanket excuse — high cap-hit must be investigated as regression.
   * This test only locks the directional claim: asymmetric completes; symmetric can cap.
   */
  it('HS-002: asymmetric r4v2 (seed+shot) has zero cap over seeds 0..49', () => {
    // Ruler A-ish headless: seed + shotCount, production respot path inside runHeadlessGame
    let caps = 0;
    for (let seed = SEED_LO; seed <= SEED_HI; seed++) {
      const r = runHeadlessGame(seed, 4, 2, MAX_SHOTS);
      if (!r.won || r.shots >= MAX_SHOTS) caps++;
    }
    expect(caps).toBe(0);
  }, 180_000);

  it('HS-002b: symmetric r4v4 (*7919 SP-004 loop) completion < 100% over seeds 0..49', () => {
    // Ruler B: SP-004 faithful — can deadlock; we only require "not always completes"
    let completed = 0;
    const n = SEED_HI - SEED_LO + 1;
    for (let seed = SEED_LO; seed <= SEED_HI; seed++) {
      const r = runSp004Style(seed, 4, 4);
      if (r.won && !r.capHit) completed++;
    }
    expect(completed).toBeLessThan(n);
    expect(completed).toBeGreaterThan(0); // sanity: not total meltdown
  }, 300_000);
});

describe('pickValidSeed()', () => {
  it('HS-003: returns a seed that produces a winner for r0=4 r1=2', () => {
    const seed = pickValidSeed(4, 2, 42);  // deterministic: fixed startSeed
    const result = runHeadlessGame(seed, 4, 2);
    expect(result.won).toBe(true);
  }, 30_000);
});
