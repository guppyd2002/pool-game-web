/**
 * Headless game simulation — used by pickValidSeed() for CEO demo seed pre-validation.
 *
 * HS-001: seed=4 (r0=4,r1=2) completes with a winner.
 * HS-002: DIV-004 / foul bimodality mechanism (QA final @ fleet 2026-08-08) — see test body.
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
import type { IBallPoolPhysics, ShotResult } from '../../game/ball-pool-physics';
import { createBallPool8Session } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import type { CueController } from '../../game/cue-controller';

const MAX_SHOTS = 200;
/** N=20 matches SP-004 / Kakashi baseline seed range 0..19 (ruler B). */
const N_SEEDS = 20;
const RANK_LAST = 5;

/** SP-005 sample seeds — asym quality only (not a cap-rate claim). */
const ASYM_SWEEP_SEEDS = [0, 3, 7, 10, 12] as const;

/**
 * Kakashi-ruled bimodal foul bands (QA final, per-seed measured, zero overlap):
 *   completed foulPerShot ≤ 0.20
 *   cap-hit   foulPerShot ≥ 0.86
 * Gap ~66pp — locks "completed vs cap-hit are qualitatively different", not a fragile %.
 */
const COMPLETED_FOUL_MAX = 0.20;
const CAP_HIT_FOUL_MIN = 0.86;

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

interface Sp004Row {
  seed: number;
  shots: number;
  foulShots: number;
  foulPerShot: number;
  completed: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
  totalPots: number;
  /** ≥7 non-8 pocketed and 8 pocketed — full run-out (SP-004 cleanWin). */
  cleanWin: boolean;
}

/**
 * SP-004 / REC-1 faithful loop (ruler B):
 *   seed + shotIndex * 7919, NO respot on null placement, production table factory.
 * Foul metric = Kakashi: post-settle isBallInHand after applyShot (not turn events).
 */
function runSp004Style(seed: number, rank0: number, rank1: number, rankLast = RANK_LAST): Sp004Row {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  let shots = 0;
  let foulShots = 0;
  let lastResult: ShotResult | null = null;
  const physics: IBallPoolPhysics = {
    applyShot(s) {
      const r = base.applyShot(s);
      lastResult = r;
      shots++;
      return r;
    },
    get shotFrames() { return base.shotFrames; },
    getBall: (id) => base.getBall(id),
    getActiveBalls: () => base.getActiveBalls(),
    get allBalls() { return base.allBalls; },
    predictAimLine: (a, b) => base.predictAimLine(a, b),
    step: (d) => base.step(d),
    start: () => base.start(),
    stop: () => base.stop(),
    get isSimulating() { return base.isSimulating; },
    getStateAsString: () => base.getStateAsString(),
    setStateFromString: (s) => base.setStateFromString(s),
    resetToStartState: () => base.resetToStartState(),
    getPhysicsConstants: () => base.getPhysicsConstants(),
    placeBall: (id, p) => base.placeBall(id, p),
    respotCueBall: () => base.respotCueBall(),
  };
  const session = createBallPool8Session({
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: SYNC_REPLAY,
  });
  let winner: 0 | 1 | null = null;
  session.onGameEnded = (w) => { winner = w; };
  session.startNewGame();

  let totalPots = 0;
  let non8Pots = 0;
  let pocketed8 = false;

  while (!session.isGameEnded && shots < MAX_SHOTS) {
    const bih = session.isBallInHand;
    const shotIdx = shots;
    const rank = session.currentPlayerIndex === 0 ? rank0 : rank1;
    const ai = calculateAIShot(
      space,
      session.getAllowableFn(),
      shotIdx === 0,
      bih,
      rank,
      rankLast,
      seed + shotIdx * 7919,
    );
    // SP-004: place only when AI returns a position — no respotCueBall fallback
    if (bih) {
      if (ai.cueBallNewPos !== null) physics.placeBall(0, ai.cueBallNewPos);
      session.notifyBallPlaced();
    }
    const before = shots;
    session.forceShot(ai.shotData);
    if (shots > before && session.isBallInHand) foulShots++;
    if (shots > before && lastResult) {
      for (const p of lastResult.pocketed) {
        totalPots++;
        if (p.ballId === 8) pocketed8 = true;
        else non8Pots++;
      }
    }
    // Soft stall: forceShot no-op must not spin forever
    if (shots === before) break;
  }

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  const completed = session.isGameEnded && !capHit;
  const cleanWin = non8Pots >= 7 && pocketed8;
  return {
    seed,
    shots,
    foulShots,
    foulPerShot: shots > 0 ? foulShots / shots : 0,
    completed,
    capHit,
    winner,
    totalPots,
    cleanWin,
  };
}

describe('runHeadlessGame()', () => {
  it('HS-001: seed=4 r0=4 r1=2 completes with a winner', () => {
    const result = runHeadlessGame(4, 4, 2);
    expect(result.won).toBe(true);
    expect(result.shots).toBeLessThan(200);
  });

  /**
   * HS-002 — QA final mechanism assertions (卡卡西 four-driver recheck + 千手 2026-08-08).
   * Ruler B only: SP-004 *7919, no respot. Measure-commit context: post-DIV-008(b) feature tree.
   *
   * History of false goldens (do not re-introduce):
   *   1) d371b76 — cap seeds under SWAPPED headless AI args.
   *   2) 72c54f5 / 11638b7 — asym cap===0 under respot-ON headless (kinder ruler, not B).
   *   3) "sym cap > asym cap" as a universal mechanism — FAILS under ruler B:
   *      r4v2 35% < r4v4 45% (noise), r2v4 == r4v4, r4v2 35% > r3v3 30%.
   *      Cap main driver is weak-shot / null-foul loop, not rank symmetry.
   *
   * Allowed assertions (do not extend):
   *   ✅ same-rank sym → cap-hit count > 0  (DIV-004 deadlock mode is real; r3~30% r4~45% N≈20)
   *   ✅ bimodal foul separation: completed fps ≤ 0.20  vs  cap-hit fps ≥ 0.86  (gap ~66pp, zero overlap)
   *   ⚠️ asym: quality only — completed games are cleanWin + have a winner (weak relative; not significant)
   *   ❌ asym cap == 0
   *   ❌ generic "sym cap > asym cap"
   *
   * Mode A record playback respot (replay-controller createPlaybackController) is out of scope —
   * that restores recorded cue positions, not live AI null placement.
   */
  it('HS-002a: symmetric same-rank (*7919 SP-004) has cap-hit > 0 (DIV-004 deadlock mode)', () => {
    // r3 and r4 both exhibit same-rank deadlock band; only require existence of ≥1 cap-hit.
    // Do NOT assert exact 30%/45% rates (N-fragile).
    for (const rank of [3, 4] as const) {
      let caps = 0;
      for (let seed = 0; seed < N_SEEDS; seed++) {
        const r = runSp004Style(seed, rank, rank);
        if (r.capHit) caps++;
      }
      expect(caps, `sym r${rank}v${rank} seeds 0..${N_SEEDS - 1} must show deadlock cap-hit`).toBeGreaterThan(0);
    }
  }, 600_000);

  it('HS-002b: bimodal foul separation on sym r4v4 (completed ≤0.20 vs cap-hit ≥0.86)', () => {
    // Hardest / most durable claim: completed and cap-hit are qualitatively different worlds.
    // Thresholds are QA per-seed measured bands with zero overlap — not medians that drift with N.
    const rows: Sp004Row[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runSp004Style(seed, 4, 4));
    }
    const completed = rows.filter((r) => r.completed && !r.capHit);
    const capHits = rows.filter((r) => r.capHit);

    // Need both populations present so the separation is testable (also implies cap>0 / some completes).
    expect(completed.length, 'need completed games for foul band').toBeGreaterThan(0);
    expect(capHits.length, 'need cap-hit games for foul band').toBeGreaterThan(0);

    for (const r of completed) {
      expect(
        r.foulPerShot,
        `completed seed=${r.seed} foulPerShot=${r.foulPerShot} must be ≤ ${COMPLETED_FOUL_MAX}`,
      ).toBeLessThanOrEqual(COMPLETED_FOUL_MAX);
    }
    for (const r of capHits) {
      expect(
        r.foulPerShot,
        `cap-hit seed=${r.seed} foulPerShot=${r.foulPerShot} must be ≥ ${CAP_HIT_FOUL_MIN}`,
      ).toBeGreaterThanOrEqual(CAP_HIT_FOUL_MIN);
    }
  }, 400_000);

  it('HS-002c: asymmetric r4v2 quality only (cleanWin + winner; NOT cap==0, NOT vs-sym)', () => {
    // Weak relative claim only. Cap rate is pair-dependent and not monotonic under ruler B.
    // SP-005 seeds: majority complete historically; we require ≥1 complete + quality on completers.
    const results = ASYM_SWEEP_SEEDS.map((seed) => runSp004Style(seed, 4, 2));
    const completed = results.filter((r) => r.completed && !r.capHit);

    expect(completed.length, 'asym demo path must complete at least one seed').toBeGreaterThanOrEqual(1);
    for (const r of completed) {
      expect(r.cleanWin, `asym seed=${r.seed} completed must be cleanWin`).toBe(true);
      expect(r.winner === 0 || r.winner === 1, `asym seed=${r.seed} must have winner`).toBe(true);
    }
    // Explicit non-assertions (documentation):
    //   ❌ expect(results.every(r => !r.capHit))  — respot-ON illusion; faithful ~41% cap N=50
    //   ❌ expect(asymCaps < symCaps)             — not universal under ruler B
  }, 180_000);
});

describe('pickValidSeed()', () => {
  it('HS-003: returns a seed that produces a winner for r0=4 r1=2', () => {
    const seed = pickValidSeed(4, 2, 42);  // deterministic: fixed startSeed
    const result = runHeadlessGame(seed, 4, 2);
    expect(result.won).toBe(true);
  }, 30_000);
});
