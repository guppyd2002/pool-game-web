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
 * Does not modify production code. Does not touch HS-002 / replay-controller / HVA product.
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

/** Self-play symmetric r vs r, seed = base + globalShot * 7919 (SP-004 formula). */
function runSelfPlaySym(seed: number, rank: number): GameRow {
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
    // SP-004 / REC-1 placement: place only when cueBallNewPos non-null — NO respot fallback
    // (respot would diverge trajectories from SP-004; product HVA path does respot separately).
    if (bih) {
      if (shot.cueBallNewPos !== null) physics.placeBall(0, shot.cueBallNewPos);
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

/**
 * HVA product path: attachHumanVsAI for P1 (AI-local *7919);
 * P0 stand-in uses global *7919 at fire time (AI-quality surrogate for human).
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
  it('self-play symmetric rank3 (*7919 global)', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) rows.push(runSelfPlaySym(seed, 3));
    const t = summarize(
      'self-play symmetric rank3',
      'seed + globalShotIndex * 7919 (both seats share global index)',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    // Structural only — quality numbers are the console table for CEO/QA
    expect(t.completionRate).toBeGreaterThanOrEqual(0);
    expect(t.completionRate).toBeLessThanOrEqual(1);
  }, 300_000);

  it('self-play symmetric rank4 SP-004 path (*7919 global)', () => {
    const rows: GameRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) rows.push(runSelfPlaySym(seed, 4));
    const t = summarize(
      'self-play symmetric rank4 (SP-004 path)',
      'seed + globalShotIndex * 7919 (both seats share global index)',
      rows,
    );
    logTable(t, MEASURE_SHA);
    expect(t.n).toBe(N_SEEDS);
    expect(t.completionRate).toBeGreaterThanOrEqual(0);
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
