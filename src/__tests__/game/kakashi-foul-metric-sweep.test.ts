/**
 * CEO foul-quality table — 卡卡西-ruled metric (test-only, reproducible).
 *
 * Official definition (QA-owned; do not invent alternatives):
 *   foulPerShot = (# of shots that awarded ball-in-hand) / (# of legal forceShot/applyShot)
 *   1. Denominator = shots (applyShot count), NEVER turns
 *   2. One applyShot → one opportunity to count a foul (sample isBallInHand post-settle)
 *   3. Report completed-only foul median
 *   4. Cap-hit / deadlock rate listed SEPARATELY — never fold deadlocks into the quality median
 *
 * Seed derivation labels (NOT interchangeable):
 *   *7919  = base + shotIndex * 7919  (SP-004 / HVA production AI path)
 *   AI-local vs global only applies inside HVA dual-drive (documented per row)
 *
 * ## Ruler-diff harness (千手拍 A — permanent anti-mixup)
 *
 * Same AI config can show night-and-day cap rates under different BIH null policies:
 *   respot=false → ruler B / SP-004 / Unity-faithful (no head-spot on null placement)
 *   respot=true  → production-historical respot-ON scale (kinder; inflates completion)
 *
 * Contrast asserts (asym r4v2, *7919, N=20) prove cap **depends on the ruler** —
 * so respotON cap===0 must NEVER be used as HS-002 green / DIV-004 mechanism.
 *
 * measureCommit notes (卡卡西, ruler B respot-invariant; measured @11638b7 ≡ 7debce3 game physics):
 *   sym r3 ≈ 30% cap, r4 ≈ 45% cap (N=20)
 *   asym r4v2 faithful ≈ 35% (N20) / 40% (N50) / 41% (N51); respotON seeds 0..50 → **0** caps
 *   asym r2v4 ≈ 45% (N20) / 36% (N50)
 *
 * OOM discipline: one config per `it()` (do not chain multi-config 50×200 in one worker).
 * Prefer `NODE_OPTIONS=--max-old-space-size=8192` or scripts/run-seed-batch.mjs for large N.
 *
 * Does not modify production code. Does not rewrite HS-002 (separate file; already final @402024c).
 */
import { describe, it, expect } from 'vitest';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { IBallPoolPhysics } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { CueController } from '../../game/cue-controller';
import type { ReplayDriver } from '../../renderer/replay-driver';
import { createBallPool8Session } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import { createPoolTable } from '../../game/table-setup';
import {
  attachHumanVsAI,
  deriveAiShotSeed,
  AI_SHOT_SEED_STRIDE,
} from '../../game/human-vs-ai';

const MAX_SHOTS = 200;
const N_SEEDS = 20;
const RANK_LAST = 5;

/** Sweep bimodal foul bands (looser than HS-002 0.20/0.86; matches SP-004 style gap). */
const SWEEP_COMPLETED_FOUL_MAX = 0.35;
const SWEEP_CAP_HIT_FOUL_MIN = 0.6;

/** Faithful asym floor — QA N20≈35%; guard against collapsing to respot-ON zero. */
const FAITHFUL_ASYM_CAP_MIN = 0.25;

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

function syncReplay(): ReplayDriver {
  return {
    watch(_p, _s, _a, _b, done) { done(); },
    resetVisibility: () => {},
    dispose: () => {},
  };
}

interface GameRow {
  seed: number;
  shots: number;
  foulShots: number;
  foulPerShot: number;
  completed: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
}

interface TableRow {
  label: string;
  seedDeriv: string;
  n: number;
  completedOnlyFoulMedian: number | null;
  capHitRate: number;
  completionRate: number;
  completed: number;
  capHits: number;
  rows: GameRow[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function summarize(label: string, seedDeriv: string, rows: GameRow[]): TableRow {
  const completed = rows.filter((r) => r.completed && !r.capHit);
  const capHits = rows.filter((r) => r.capHit);
  const completedRates = completed.map((r) => r.foulPerShot);
  return {
    label,
    seedDeriv,
    n: rows.length,
    completedOnlyFoulMedian: median(completedRates),
    capHitRate: capHits.length / rows.length,
    completionRate: completed.length / rows.length,
    completed: completed.length,
    capHits: capHits.length,
    rows,
  };
}

function logTable(t: TableRow, measureSha: string): void {
  const med = t.completedOnlyFoulMedian == null ? 'n/a' : t.completedOnlyFoulMedian.toFixed(3);
  console.log(
    `[KAKASHI-METRIC] ${t.label}\n` +
    `  seedDeriv=${t.seedDeriv}\n` +
    `  completed-only foul median=${med}\n` +
    `  cap-hit rate=${t.capHits}/${t.n} (${(t.capHitRate * 100).toFixed(0)}%)\n` +
    `  completion=${t.completed}/${t.n} (${(t.completionRate * 100).toFixed(0)}%)\n` +
    `  measure_commit=${measureSha}`,
  );
  for (const r of t.rows) {
    console.log(
      `    seed=${r.seed} shots=${r.shots} foulShots=${r.foulShots} ` +
      `fps=${r.foulPerShot.toFixed(3)} completed=${r.completed} cap=${r.capHit} w=${r.winner}`,
    );
  }
}

/**
 * Self-play config runner (*7919 global both seats).
 * @param respot false = ruler B / SP-004 (no respot on null); true = respot-ON scale.
 * Asymmetry via r0 ≠ r1.
 */
function runSelfPlayCfg(seed: number, rank0: number, rank1: number, respot: boolean): GameRow {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  let shots = 0;
  let foulShots = 0;
  const physics: IBallPoolPhysics = {
    applyShot(s) {
      const r = base.applyShot(s);
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
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: syncReplay(),
  });
  let winner: 0 | 1 | null = null;
  session.onGameEnded = (w) => { winner = w; };
  session.startNewGame();

  while (!session.isGameEnded && shots < MAX_SHOTS) {
    const bih = session.isBallInHand;
    const shotIdx = shots;
    const rank = session.currentPlayerIndex === 0 ? rank0 : rank1;
    // Signature (isFirstShot, ballInHand); seed *7919 global
    const shot = calculateAIShot(
      space,
      session.getAllowableFn(),
      shotIdx === 0,
      bih,
      rank,
      RANK_LAST,
      seed + shotIdx * AI_SHOT_SEED_STRIDE,
    );
    if (bih) {
      // Ruler switch: place if AI returned a pos; else optional head-spot respot.
      if (shot.cueBallNewPos !== null) physics.placeBall(0, shot.cueBallNewPos);
      else if (respot) physics.respotCueBall();
      session.notifyBallPlaced();
    }
    const before = shots;
    session.forceShot(shot.shotData);
    if (shots > before && session.isBallInHand) foulShots++;
    // If forceShot no-op'd, still must not spin forever: treat as soft stall
    if (shots === before) break;
  }

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  const completed = session.isGameEnded && !capHit;
  return {
    seed,
    shots,
    foulShots,
    foulPerShot: shots > 0 ? foulShots / shots : 0,
    completed,
    capHit,
    winner,
  };
}

/** Symmetric same-rank shortcut (default ruler B / no respot). */
function runSelfPlaySym(seed: number, rank: number, respot = false): GameRow {
  return runSelfPlayCfg(seed, rank, rank, respot);
}

/**
 * HVA product path: attachHumanVsAI for P1 (AI-local *7919);
 * P0 stand-in uses global *7919 at fire time (AI-quality surrogate for human).
 * P0 stand-in still uses respot-ON on null — documents product dual-drive, not ruler B.
 */
function runHvaProduct(seed: number, rank = 3): GameRow {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  let shots = 0;
  let foulShots = 0;
  const physics: IBallPoolPhysics = {
    applyShot(s) {
      const r = base.applyShot(s);
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
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: syncReplay(),
  });
  const scheduled: Array<() => void> = [];
  let winner: 0 | 1 | null = null;
  session.onGameEnded = (w) => { winner = w; };

  attachHumanVsAI(
    session,
    physics,
    space,
    {
      aiSeat: 1,
      aiRank: rank,
      rankLast: RANK_LAST,
      seed,
      turnDelayMs: 0,
      bihSettleMs: 0,
      setTimeoutFn: (fn) => {
        scheduled.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {},
    },
  );

  session.startNewGame();

  let stall = 0;
  let guard = 0;
  while (!session.isGameEnded && shots < MAX_SHOTS && stall < 12 && guard < MAX_SHOTS * 4) {
    guard++;
    if (scheduled.length > 0) {
      const before = shots;
      scheduled.shift()!();
      if (shots > before) {
        if (session.isBallInHand) foulShots++;
        stall = 0;
      }
      continue;
    }
    if (session.isGameEnded) break;

    if (session.currentPlayerIndex === 0) {
      const bih = session.isBallInHand;
      const shotIdx = shots;
      const shot = calculateAIShot(
        space,
        session.getAllowableFn(),
        shotIdx === 0,
        bih,
        rank,
        RANK_LAST,
        deriveAiShotSeed(seed, shotIdx), // global *7919 for human stand-in
      );
      if (bih) {
        if (shot.cueBallNewPos) physics.placeBall(0, shot.cueBallNewPos);
        else physics.respotCueBall();
        session.notifyBallPlaced();
      }
      const before = shots;
      session.forceShot(shot.shotData);
      if (shots === before) {
        stall++;
        if (stall > 5) break;
      } else {
        if (session.isBallInHand) foulShots++;
        stall = 0;
      }
    } else {
      stall++;
      if (stall > 5) break;
    }
  }

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  const completed = session.isGameEnded && !capHit;
  return {
    seed,
    shots,
    foulShots,
    foulPerShot: shots > 0 ? foulShots / shots : 0,
    completed,
    capHit,
    winner,
  };
}

/** Placeholder filled by the runner from process env or hardcoded at report time. */
const MEASURE_SHA = process.env.MEASURE_SHA ?? 'HEAD';

describe('Kakashi-metric foul quality table (N=20)', () => {
  it('self-play symmetric rank3 (*7919, ruler B no respot) — deadlock exists', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) rows.push(runSelfPlaySym(seed, 3, false));
    const t = summarize(
      'self-play symmetric rank3 (ruler B)',
      'seed + globalShotIndex * 7919; respot=false',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    // DIV-004: same-rank deadlock mode is real (QA ~30% N=20 — do not lock exact rate)
    expect(t.capHits, 'sym r3v3 must show at least one cap-hit').toBeGreaterThan(0);
  }, 300_000);

  it('self-play symmetric rank4 SP-004 path (*7919, ruler B) — cap>0 + bimodal foul', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) rows.push(runSelfPlaySym(seed, 4, false));
    const t = summarize(
      'self-play symmetric rank4 (SP-004 / ruler B)',
      'seed + globalShotIndex * 7919; respot=false',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    // Deadlock mode (QA ~45% N=20)
    expect(t.capHits, 'sym r4v4 must show at least one cap-hit').toBeGreaterThan(0);

    const completed = rows.filter((r) => r.completed && !r.capHit);
    const capHits = rows.filter((r) => r.capHit);
    expect(completed.length).toBeGreaterThan(0);
    for (const r of completed) {
      expect(
        r.foulPerShot,
        `completed seed=${r.seed} fps=${r.foulPerShot}`,
      ).toBeLessThan(SWEEP_COMPLETED_FOUL_MAX);
    }
    for (const r of capHits) {
      expect(
        r.foulPerShot,
        `cap-hit seed=${r.seed} fps=${r.foulPerShot}`,
      ).toBeGreaterThan(SWEEP_CAP_HIT_FOUL_MIN);
    }
  }, 300_000);

  /**
   * Ruler-diff core (pair with next it): same config 4v2 *7919, only respot flag differs.
   * Together they prove cap is ruler-dependent — never use respotON zero as mechanism green.
   */
  it('ruler-diff A: faithful asym r4v2 (*7919, respot=false) cap rate > 0.25', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runSelfPlayCfg(seed, 4, 2, false));
    }
    const t = summarize(
      'asym r4v2 faithful (ruler B)',
      'seed + globalShotIndex * 7919; respot=false; ranks 4 vs 2',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    // QA: N20≈35%, N50≈40% — floor 0.25 leaves margin; proves NOT the respot-ON zero world
    expect(t.capHitRate, `faithful asym capRate=${t.capHitRate}`).toBeGreaterThan(FAITHFUL_ASYM_CAP_MIN);
  }, 300_000);

  it('ruler-diff B: respotON asym r4v2 (*7919, respot=true) cap === 0', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runSelfPlayCfg(seed, 4, 2, true));
    }
    const t = summarize(
      'asym r4v2 respot-ON (kinder scale)',
      'seed + globalShotIndex * 7919; respot=true on null placement; ranks 4 vs 2',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    // Documents respot ruler: QA seeds 0..50 → 0 caps. NOT HS-002 green / NOT mechanism.
    expect(t.capHits, 'respotON asym must be zero-cap (kinder scale)').toBe(0);
    // Cross-doc for readers of the console table:
    console.log(
      '[RULER-DIFF] respotON asym r4v2 cap===0 coexists with faithful cap>0.25 on same ranks — ' +
      'cap depends on ruler; NEVER take respotON zero as HS-002/DIV-004 green.',
    );
  }, 300_000);

  it('HVA product path rank3 (P1 AI-local *7919; P0 stand-in global *7919)', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) rows.push(runHvaProduct(seed, 3));
    const t = summarize(
      'HVA product path rank3',
      'P1 attachHumanVsAI: AI-local *7919; P0 stand-in: global *7919 at fire (NOT comparable 1:1 to pure self-play)',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    expect(t.completionRate).toBeGreaterThanOrEqual(0);
  }, 300_000);
});
