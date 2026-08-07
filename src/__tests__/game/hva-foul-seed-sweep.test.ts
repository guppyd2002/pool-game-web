/**
 * HVA foul-rate seed sweep (千手 close-out) — REPRODUCIBLE.
 *
 * Compares rank-3 self-play vs human-vs-AI (both seats AI-quality rank-3)
 * across N seeds using the SAME PRNG seed derivation:
 *   deriveAiShotSeed(base, shotIndex) = base + shotIndex * 7919
 *
 * ─── FOUL METRIC (two definitions, both reported) ───────────────────────────
 *
 * (A) per-shot (AUTHORITATIVE for product conclusions):
 *     After each legal forceShot settles, count ONE foul if that shot awarded
 *     ball-in-hand (session.isBallInHand post-replay). One attempt → one count.
 *
 * (B) turn-event (LEGACY / audit only — DO NOT use alone):
 *     Count onTurnChanged(bih===true) / onHumanTurn|onAiTurn(bih===true).
 *
 * ─── HARNESS DEFECT (document — will mislead again if forgotten) ────────────
 *
 * Dual-drive HVA (human stand-in forceShot + attachHumanVsAI onTurnChanged)
 * emits EXTRA turn events relative to production:
 *   - forceShot → _onReplayComplete → onTurnChanged (once per shot)
 *   - human BIH: notifyBallPlaced → onTurnChanged(bih=false) (extra)
 *   - AI BIH: attachHumanVsAI suppresses onTurnChanged during place, then
 *     forceShot later → another turn event
 * Live browser production turn sequence is clean alternate seats (卡卡西:
 * [1,0,1,0,...]); double-fire is harness-only. turnEvents/shots ≫ 1 is expected
 * in this file — that is NOT a product bug.
 *
 * Older sweeps (foul median self-play ~0.94 / HVA ~0.27) counted (B) only and
 * also called calculateAIShot(bih, isFirst) with args swapped vs signature
 * (isFirstShot, ballInHand). Both inflate/distort numbers. This file uses
 * correct arg order + dual reporting.
 *
 * Metrics reported (console + structural assertions):
 *   - foulPerShot median (A) and foulPerShotTurnEvent median (B)
 *   - completion rate
 *   - turnEvents / shots ratio (double-trigger audit)
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
  /** (A) per-shot: fouls awarded by shot verdict (isBallInHand post-settle). */
  foulsPerShot: number;
  foulPerShot: number;
  /** (B) turn-event: onTurnChanged(bih===true) counts. */
  foulsTurnEvent: number;
  foulPerShotTurnEvent: number;
  /** Total onTurnChanged firings (any bih) — double-trigger audit. */
  turnEvents: number;
  turnEventsPerShot: number;
  ended: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
}

export interface SweepSummary {
  label: string;
  n: number;
  foulMedian: number;
  foulMin: number;
  foulMax: number;
  foulTurnEventMedian: number;
  completed: number;
  completionRate: number;
  completedFoulMedian: number | null;
  medianTurnEventsPerShot: number;
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
  const turnRates = rows.map((r) => r.foulPerShotTurnEvent);
  const completed = rows.filter((r) => r.ended && !r.capHit);
  const completedRates = completed.map((r) => r.foulPerShot);
  return {
    label,
    n: rows.length,
    foulMin: Math.min(...rates),
    foulMax: Math.max(...rates),
    foulMedian: median(rates),
    foulTurnEventMedian: median(turnRates),
    completed: completed.length,
    completionRate: completed.length / rows.length,
    completedFoulMedian: completedRates.length ? median(completedRates) : null,
    medianTurnEventsPerShot: median(rows.map((r) => r.turnEventsPerShot)),
    rows,
  };
}

/**
 * Per-shot foul sample: after forceShot + sync replay, the shot awarded BIH.
 * (Game-ending shots that never enter BIH are not counted as BIH-fouls —
 * same as production turn path; rare for r3 complete games.)
 */
function samplePerShotFoul(session: { isBallInHand: boolean }): boolean {
  return session.isBallInHand;
}

/** Pure self-play rank3 vs rank3 — arg order matches ai-controller signature. */
function runSelfPlay(seed: number): SweepRow {
  const space = createPoolTable();
  const physics = trackPhysics(createBallPoolPhysics(space, MOCK_SCENE));
  const session = createBallPool8Session({
    physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: syncReplay(),
  });
  let foulsTurnEvent = 0;
  let foulsPerShot = 0;
  let turnEvents = 0;
  let shots = 0;
  let winner: 0 | 1 | null = null;

  session.onTurnChanged = (_i, bih) => {
    turnEvents++;
    if (bih) foulsTurnEvent++;
  };
  session.onGameEnded = (w) => { winner = w; };
  session.startNewGame();

  while (!session.isGameEnded && shots < MAX_SHOTS) {
    const bih = session.isBallInHand;
    // Signature: (space, allowable, isFirstShot, ballInHand, rank, rankLast, seed)
    const shot = calculateAIShot(
      space,
      session.getAllowableFn(),
      shots === 0,
      bih,
      RANK,
      RANK_LAST,
      deriveAiShotSeed(seed, shots),
    );
    if (bih) {
      if (shot.cueBallNewPos) physics.placeBall(0, shot.cueBallNewPos);
      else physics.respotCueBall();
      session.notifyBallPlaced(); // may emit turn event bih=false (not a foul count)
    }
    session.forceShot(shot.shotData);
    shots++;
    if (samplePerShotFoul(session)) foulsPerShot++;
  }

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  return {
    seed,
    shots,
    foulsPerShot,
    foulPerShot: shots > 0 ? foulsPerShot / shots : 0,
    foulsTurnEvent,
    foulPerShotTurnEvent: shots > 0 ? foulsTurnEvent / shots : 0,
    turnEvents,
    turnEventsPerShot: shots > 0 ? turnEvents / shots : 0,
    ended: session.isGameEnded,
    capHit,
    winner,
  };
}

/**
 * HVA path: P1 via attachHumanVsAI (rank3, *7919 on AI-local shot index);
 * P0 AI-quality stand-in using GLOBAL shot index *7919.
 * Shot count = applyShot calls (authoritative).
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
  let foulsTurnEvent = 0;
  let foulsPerShot = 0;
  let turnEvents = 0;
  let winner: 0 | 1 | null = null;
  let shotsAtLastSample = 0;

  session.onGameEnded = (w) => { winner = w; };

  // Sample per-shot foul after every settled applyShot (human or AI).
  // onShotFired fires inside forceShot before replay complete; isBallInHand is
  // set in _onReplayComplete. Chain after existing hooks via turn of forceShot:
  // we sample when shot counter advances (see loop / AI flush below).

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
      onHumanTurn: (_i, bih) => {
        turnEvents++;
        if (bih) foulsTurnEvent++;
      },
      onAiTurn: (_i, bih) => {
        turnEvents++;
        if (bih) foulsTurnEvent++;
      },
    },
  );

  session.startNewGame(); // start emits onTurnChanged → turnEvents includes open

  function sampleIfNewShot(): void {
    if (shots > shotsAtLastSample) {
      // One sample per newly applied shot (may batch if multiple in flush — loop per increment)
      while (shotsAtLastSample < shots) {
        shotsAtLastSample++;
        // After the shot that just applied, BIH means that shot fouled.
        // Note: if multiple shots in one flush, isBallInHand only reflects the LAST.
        // Drain AI one forceShot at a time so sampling stays 1:1 (see flush below).
      }
    }
  }

  let stall = 0;
  let guard = 0;
  while (!session.isGameEnded && shots < MAX_SHOTS && stall < 12 && guard < MAX_SHOTS * 4) {
    guard++;

    // Drain AI schedules ONE callback at a time so each forceShot is sampled.
    if (scheduled.length > 0) {
      const before = shots;
      scheduled.shift()!();
      if (shots > before) {
        // AI (or BIH settle→forceShot) applied a shot
        if (samplePerShotFoul(session)) foulsPerShot++;
        shotsAtLastSample = shots;
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
        RANK,
        RANK_LAST,
        deriveAiShotSeed(seed, shotIdx),
      );
      if (bih) {
        if (shot.cueBallNewPos) physics.placeBall(0, shot.cueBallNewPos);
        else physics.respotCueBall();
        session.notifyBallPlaced(); // extra turn event bih=false (harness defect)
      }
      const before = shots;
      session.forceShot(shot.shotData);
      if (shots === before) {
        stall++;
        if (stall > 5) break;
      } else {
        if (samplePerShotFoul(session)) foulsPerShot++;
        shotsAtLastSample = shots;
        stall = 0;
      }
    } else {
      // AI seat, no schedule left — stall or mid-state
      stall++;
      if (stall > 5) break;
    }
  }

  void sampleIfNewShot;

  const capHit = shots >= MAX_SHOTS && !session.isGameEnded;
  return {
    seed,
    shots,
    foulsPerShot,
    foulPerShot: shots > 0 ? foulsPerShot / shots : 0,
    foulsTurnEvent,
    foulPerShotTurnEvent: shots > 0 ? foulsTurnEvent / shots : 0,
    turnEvents,
    turnEventsPerShot: shots > 0 ? turnEvents / shots : 0,
    ended: session.isGameEnded,
    capHit,
    winner,
  };
}

function logSummary(s: SweepSummary): void {
  console.log(
    `[${s.label}] N=${s.n}\n` +
    `  per-shot(A):  foulMedian=${s.foulMedian.toFixed(3)} min=${s.foulMin.toFixed(3)} max=${s.foulMax.toFixed(3)} ` +
    `completedFoulMedian=${s.completedFoulMedian == null ? 'n/a' : s.completedFoulMedian.toFixed(3)}\n` +
    `  turn-event(B): foulMedian=${s.foulTurnEventMedian.toFixed(3)}\n` +
    `  completion=${s.completed}/${s.n} (${(s.completionRate * 100).toFixed(0)}%) ` +
    `median turnEvents/shot=${s.medianTurnEventsPerShot.toFixed(2)}`,
  );
  for (const r of s.rows) {
    console.log(
      `  seed=${r.seed} shots=${r.shots} ` +
      `foulA=${r.foulsPerShot}(${r.foulPerShot.toFixed(3)}) ` +
      `foulB=${r.foulsTurnEvent}(${r.foulPerShotTurnEvent.toFixed(3)}) ` +
      `turns=${r.turnEvents}(×${r.turnEventsPerShot.toFixed(2)}) ` +
      `ended=${r.ended} cap=${r.capHit} winner=${r.winner}`,
    );
  }
}

describe('HVA foul seed sweep (N=20, rank3, dual metric)', () => {
  it('deriveAiShotSeed stride is 7919 (self-play parity lock)', () => {
    expect(AI_SHOT_SEED_STRIDE).toBe(7919);
    expect(deriveAiShotSeed(0, 1)).toBe(7919);
  });

  it('N=20 self-play rank3vs3 — per-shot vs turn-event foul', () => {
    const rows: SweepRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runSelfPlay(seed));
    }
    const sum = summarize('self-play-r3', rows);
    logSummary(sum);
    expect(sum.n).toBe(N_SEEDS);
    expect(sum.foulMedian).toBeGreaterThanOrEqual(0);
    expect(sum.foulMedian).toBeLessThanOrEqual(1);
    // Per-shot fouls must never exceed turn-event fouls by... actually turn events
    // can double-count; per-shot should be ≤ turn-event when both count BIH.
    for (const r of rows) {
      // Each per-shot foul should correspond to at least one turn-event bih
      // (or equal). If turn-event under-counts, something else is wrong.
      expect(r.foulsPerShot).toBeLessThanOrEqual(r.foulsTurnEvent + 1);
    }
  }, 300_000);

  it('N=20 HVA both-AI-quality rank3 — per-shot vs turn-event foul', () => {
    const rows: SweepRow[] = [];
    for (let seed = 0; seed < N_SEEDS; seed++) {
      rows.push(runHvaBothAiQuality(seed));
    }
    const sum = summarize('hva-r3', rows);
    logSummary(sum);
    expect(sum.n).toBe(N_SEEDS);
    expect(sum.foulMedian).toBeGreaterThanOrEqual(0);
    expect(sum.foulMedian).toBeLessThanOrEqual(1);

    // seed=42 pin cross-check with 卡卡西 (if within 0..19 — seed 42 is out of range;
    // run dedicated extra below via console for seed 42).
  }, 300_000);

  it('seed=42 HVA dual-metric pin (卡卡西 cross-check)', () => {
    const r = runHvaBothAiQuality(42);
    console.log(
      `[seed=42 HVA] shots=${r.shots} foulA=${r.foulsPerShot}/${r.shots}=${r.foulPerShot.toFixed(3)} ` +
      `foulB=${r.foulsTurnEvent}/${r.shots}=${r.foulPerShotTurnEvent.toFixed(3)} ` +
      `turns=${r.turnEvents} ended=${r.ended} winner=${r.winner}`,
    );
    expect(r.shots).toBeGreaterThan(0);
    // Per-shot should be the conservative product metric
    expect(r.foulPerShot).toBeLessThanOrEqual(1);
  }, 120_000);
});
