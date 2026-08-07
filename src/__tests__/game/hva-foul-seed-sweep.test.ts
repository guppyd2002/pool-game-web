/**
 * HVA foul-rate seed sweep (千手 close-out) — REPRODUCIBLE.
 *
 * Compares rank-3 self-play vs human-vs-AI (both seats AI-quality rank-3)
 * across N seeds using the SAME PRNG seed derivation:
 *   deriveAiShotSeed(base, shotIndex) = base + shotIndex * 7919
 *
 * Metrics reported (console + assertions on structural sanity):
 *   - foulPerShot median / min / max (all seeds)
 *   - completion rate (ended without cap)
 *   - foulPerShot median among completed games only
 *
 * foul definition matches self-play REC-1: count onTurnChanged(bih=true).
 * foulPerShot = fouls / shots (not / turns).
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
const RANK = 3;
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

function trackPhysics(base: IBallPoolPhysics): IBallPoolPhysics {
  return {
    applyShot(s) { return base.applyShot(s); },
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
}

export interface SweepRow {
  seed: number;
  shots: number;
  fouls: number;
  foulPerShot: number;
  ended: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
}

export interface SweepSummary {
  label: string;
  n: number;
  foulMin: number;
  foulMax: number;
  foulMedian: number;
  completed: number;
  completionRate: number;
  completedFoulMedian: number | null;
  rows: SweepRow[];
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function summarize(label: string, rows: SweepRow[]): SweepSummary {
  const rates = rows.map((r) => r.foulPerShot);
  const completed = rows.filter((r) => r.ended && !r.capHit);
  const completedRates = completed.map((r) => r.foulPerShot);
  return {
    label,
    n: rows.length,
    foulMin: Math.min(...rates),
    foulMax: Math.max(...rates),
    foulMedian: median(rates),
    completed: completed.length,
    completionRate: completed.length / rows.length,
    completedFoulMedian: completedRates.length ? median(completedRates) : null,
    rows,
  };
}

/** Pure self-play rank3 vs rank3 — same as REC-1 harness. */
function runSelfPlay(seed: number): SweepRow {
  const space = createPoolTable();
  const physics = trackPhysics(createBallPoolPhysics(space, MOCK_SCENE));
  const session = createBallPool8Session({
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: syncReplay(),
  });
  let fouls = 0;
  let shots = 0;
  let winner: 0 | 1 | null = null;
  session.onTurnChanged = (_i, bih) => { if (bih) fouls++; };
  session.onGameEnded = (w) => { winner = w; };
  session.startNewGame();
  while (!session.isGameEnded && shots < MAX_SHOTS) {
    const bih = session.isBallInHand;
    const shot = calculateAIShot(
      space,
      session.getAllowableFn(),
      bih,
      shots === 0,
      RANK,
      RANK_LAST,
      deriveAiShotSeed(seed, shots),
    );
    if (bih) {
      if (shot.cueBallNewPos) physics.placeBall(0, shot.cueBallNewPos);
      session.notifyBallPlaced();
    }
    session.forceShot(shot.shotData);
    shots++;
  }
  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  return {
    seed,
    shots,
    fouls,
    foulPerShot: shots > 0 ? fouls / shots : 0,
    ended: session.isGameEnded,
    capHit,
    winner,
  };
}

/**
 * HVA path: P1 via attachHumanVsAI (rank3, *7919 on AI-local shot index);
 * P0 AI-quality stand-in using GLOBAL shot index *7919 (same formula).
 * Shot count = applyShot calls (authoritative); fouls = bih turn starts.
 */
function runHvaBothAiQuality(seed: number): SweepRow {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  let shots = 0;
  const physics: IBallPoolPhysics = {
    ...trackPhysics(base),
    applyShot(s) {
      shots++;
      return base.applyShot(s);
    },
  };
  const session = createBallPool8Session({
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: syncReplay(),
  });
  const scheduled: Array<() => void> = [];
  let fouls = 0;
  let winner: 0 | 1 | null = null;

  session.onGameEnded = (w) => { winner = w; };

  attachHumanVsAI(
    session,
    physics,
    space,
    {
      aiSeat: 1,
      aiRank: RANK,
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
    {
      onHumanTurn: (_i, bih) => { if (bih) fouls++; },
      onAiTurn: (_i, bih) => { if (bih) fouls++; },
    },
  );

  session.startNewGame();

  let stall = 0;
  let guard = 0;
  while (!session.isGameEnded && shots < MAX_SHOTS && stall < 12 && guard < MAX_SHOTS * 4) {
    guard++;
    // Drain AI schedules first
    while (scheduled.length > 0) scheduled.shift()!();
    if (session.isGameEnded) break;

    if (session.currentPlayerIndex === 0) {
      const bih = session.isBallInHand;
      // Global index for human stand-in (matches self-play shot ordinal at fire time)
      const shotIdx = shots; // next applyShot will be this index
      const shot = calculateAIShot(
        space,
        session.getAllowableFn(),
        bih,
        shotIdx === 0,
        RANK,
        RANK_LAST,
        deriveAiShotSeed(seed, shotIdx),
      );
      if (bih) {
        if (shot.cueBallNewPos) physics.placeBall(0, shot.cueBallNewPos);
        else physics.respotCueBall();
        session.notifyBallPlaced();
      }
      const before = shots;
      session.forceShot(shot.shotData);
      if (shots === before) {
        // forceShot no-op (wrong phase) — abort
        stall++;
        if (stall > 5) break;
      } else {
        stall = 0;
      }
    } else {
      // AI turn: must have scheduled work or just completed a flush
      if (scheduled.length > 0) {
        stall = 0;
        continue;
      }
      // After flush, if still AI seat with no schedule, AI may be mid-BIH settle already flushed
      stall++;
      if (stall > 5) break;
    }
  }

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  return {
    seed,
    shots,
    fouls,
    foulPerShot: shots > 0 ? fouls / shots : 0,
    ended: session.isGameEnded,
    capHit,
    winner,
  };
}

function logSummary(s: SweepSummary): void {
  console.log(
    `[${s.label}] N=${s.n} foulPerShot median=${s.foulMedian.toFixed(3)} ` +
    `min=${s.foulMin.toFixed(3)} max=${s.foulMax.toFixed(3)} ` +
    `completion=${s.completed}/${s.n} (${(s.completionRate * 100).toFixed(0)}%) ` +
    `completedFoulMedian=${s.completedFoulMedian == null ? 'n/a' : s.completedFoulMedian.toFixed(3)}`,
  );
  for (const r of s.rows) {
    console.log(
      `  seed=${r.seed} shots=${r.shots} fouls=${r.fouls} foul/s=${r.foulPerShot.toFixed(3)} ` +
      `ended=${r.ended} cap=${r.capHit} winner=${r.winner}`,
    );
  }
}

describe('HVA foul seed sweep (N=20, rank3)', () => {
  it('deriveAiShotSeed stride is 7919 (self-play parity lock)', () => {
    expect(AI_SHOT_SEED_STRIDE).toBe(7919);
    expect(deriveAiShotSeed(0, 1)).toBe(7919);
  });

  it('N=20 self-play rank3vs3 distribution', () => {
    const rows: SweepRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runSelfPlay(seed));
    }
    const sum = summarize('self-play-r3', rows);
    logSummary(sum);
    expect(sum.n).toBe(N_SEEDS);
    expect(sum.foulMedian).toBeGreaterThanOrEqual(0);
    expect(sum.foulMedian).toBeLessThanOrEqual(1);
  }, 300_000);

  it('N=20 HVA both-AI-quality rank3 distribution (post *7919 fix)', () => {
    const rows: SweepRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runHvaBothAiQuality(seed));
    }
    const sum = summarize('hva-r3', rows);
    logSummary(sum);
    expect(sum.n).toBe(N_SEEDS);
    expect(sum.foulMedian).toBeGreaterThanOrEqual(0);
    expect(sum.foulMedian).toBeLessThanOrEqual(1);
  }, 300_000);
});
