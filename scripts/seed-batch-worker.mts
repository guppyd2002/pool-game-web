/**
 * One-seed worker for run-seed-batch.mjs (exits after one game → frees heap).
 *
 * Usage (via parent):
 *   node --import tsx scripts/seed-batch-worker.mts \
 *     --harness sp004|headless --seed N --rank0 R --rank1 R [--rankLast 5] [--maxShots 200]
 *
 * Prints one JSON line to stdout; other logs to stderr.
 */
import { createPoolTable } from '../src/game/table-setup.ts';
import { createBallPoolPhysics } from '../src/game/ball-pool-physics.ts';
import { createBallPool8Session } from '../src/game/game-session.ts';
import { calculateAIShot } from '../src/game/ai-controller.ts';
import { runHeadlessGame } from '../src/game/headless-game.ts';

type Harness = 'sp004' | 'headless';

function arg(name: string, def?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  if (def !== undefined) return def;
  throw new Error(`missing --${name}`);
}

function num(name: string, def?: number): number {
  const v = arg(name, def === undefined ? undefined : String(def));
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`bad --${name}=${v}`);
  return n;
}

const STUB = {
  updateBallPosition: () => {},
  render: () => {},
  dispose: () => {},
  renderer: null,
  camera: null,
  scene: null,
  balls: [],
  table: null,
  activeCamera: null,
  setOrthoTop: () => {},
} as never;

const CUE = {
  onShotApplied: null,
  enable: () => {},
  disable: () => {},
  resetForNewTurn: () => {},
} as never;

const SYNC = {
  watch: (_a: unknown, _b: unknown, _c: unknown, _d: unknown, done: () => void) => { done(); },
  resetVisibility: () => {},
  dispose: () => {},
} as never;

/** SP-004 / ruler B: *7919, no respot, production table. */
function runSp004(
  seed: number,
  rank0: number,
  rank1: number,
  rankLast: number,
  maxShots: number,
): {
  seed: number;
  shots: number;
  fouls: number;
  foulPerShot: number;
  completed: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
} {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, STUB);
  let applyCount = 0;
  let foulShots = 0;
  const physics = {
    applyShot(s: unknown) {
      applyCount++;
      return base.applyShot(s as never);
    },
    get shotFrames() { return base.shotFrames; },
    getBall: (id: number) => base.getBall(id),
    getActiveBalls: () => base.getActiveBalls(),
    get allBalls() { return base.allBalls; },
    predictAimLine: (a: unknown, b: unknown) => base.predictAimLine(a as never, b as never),
    step: (d: number) => base.step(d),
    start: () => base.start(),
    stop: () => base.stop(),
    get isSimulating() { return base.isSimulating; },
    getStateAsString: () => base.getStateAsString(),
    setStateFromString: (s: string) => base.setStateFromString(s),
    resetToStartState: () => base.resetToStartState(),
    getPhysicsConstants: () => base.getPhysicsConstants(),
    placeBall: (id: number, p: unknown) => base.placeBall(id, p as never),
    respotCueBall: () => base.respotCueBall(),
  };
  const session = createBallPool8Session({
    physics: physics as never,
    cue: CUE,
    scene: STUB,
    replayDriver: SYNC,
  });
  let winner: 0 | 1 | null = null;
  let ended = false;
  session.onGameEnded = (w) => { ended = true; winner = w; };
  session.startNewGame();
  let shotCount = 0;
  while (!ended && shotCount < maxShots) {
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
    // SP-004: no respot
    if (bih) {
      if (ai.cueBallNewPos !== null) physics.placeBall(0, ai.cueBallNewPos);
      session.notifyBallPlaced();
    }
    const before = applyCount;
    session.forceShot(ai.shotData);
    if (applyCount > before && session.isBallInHand) foulShots++;
    // Kakashi soft stall: forceShot no-op must not spin forever
    if (applyCount === before) break;
    shotCount++;
  }
  const shots = applyCount;
  const capHit = shots >= maxShots && !ended;
  const completed = ended && !capHit;
  return {
    seed,
    shots,
    fouls: foulShots,
    foulPerShot: shots > 0 ? foulShots / shots : 0,
    completed,
    capHit,
    winner,
  };
}

/** Headless / ruler A path: seed+shotCount (post-DIV-008(b): no respot in runHeadlessGame). */
function runHeadless(
  seed: number,
  rank0: number,
  rank1: number,
  maxShots: number,
): {
  seed: number;
  shots: number;
  fouls: number;
  foulPerShot: number;
  completed: boolean;
  capHit: boolean;
  winner: 0 | 1 | null;
} {
  // runHeadlessGame only returns won/shots — re-run thin wrapper for foul count via isBallInHand
  // Prefer full loop for Kakashi foul metric consistency with applyShot sampling.
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, STUB);
  let foulShots = 0;
  let applyCount = 0;
  const physics = {
    applyShot(s: unknown) {
      applyCount++;
      return base.applyShot(s as never);
    },
    get shotFrames() { return base.shotFrames; },
    getBall: (id: number) => base.getBall(id),
    getActiveBalls: () => base.getActiveBalls(),
    get allBalls() { return base.allBalls; },
    predictAimLine: (a: unknown, b: unknown) => base.predictAimLine(a as never, b as never),
    step: (d: number) => base.step(d),
    start: () => base.start(),
    stop: () => base.stop(),
    get isSimulating() { return base.isSimulating; },
    getStateAsString: () => base.getStateAsString(),
    setStateFromString: (s: string) => base.setStateFromString(s),
    resetToStartState: () => base.resetToStartState(),
    getPhysicsConstants: () => base.getPhysicsConstants(),
    placeBall: (id: number, p: unknown) => base.placeBall(id, p as never),
    respotCueBall: () => base.respotCueBall(),
  };
  const session = createBallPool8Session({
    physics: physics as never,
    cue: CUE,
    scene: STUB,
    replayDriver: SYNC,
  });
  const ranks: [number, number] = [rank0, rank1];
  let shotCount = 0;
  let isFirstShot = true;
  let won = false;
  let winner: 0 | 1 | null = null;
  let pending: boolean | null = null;
  session.onGameEnded = (w) => { won = true; winner = w; };
  session.onTurnChanged = (_i, bih) => {
    if (session.isGameEnded || shotCount >= maxShots) return;
    pending = bih;
  };
  session.startNewGame();
  while (pending !== null && shotCount < maxShots && !session.isGameEnded) {
    const bih = pending;
    pending = null;
    const rank = ranks[session.currentPlayerIndex]!;
    const ai = calculateAIShot(
      space,
      session.getAllowableFn(),
      isFirstShot,
      bih,
      rank,
      5,
      seed + shotCount,
    );
    // Match headless-game seed formula: seed + shotCount BEFORE increment
    // (first shot uses seed+0).
    shotCount++;
    isFirstShot = false;
    if (bih) {
      // DIV-008(b): place only if non-null — no respot
      if (ai.cueBallNewPos) physics.placeBall(0, ai.cueBallNewPos);
      const saved = session.onTurnChanged;
      session.onTurnChanged = null;
      session.notifyBallPlaced();
      session.onTurnChanged = saved;
    }
    const before = applyCount;
    if (!session.isGameEnded) session.forceShot(ai.shotData);
    if (applyCount > before && session.isBallInHand) foulShots++;
    if (applyCount === before && !won) break;
  }
  const shots = applyCount > 0 ? applyCount : shotCount;
  const capHit = shots >= maxShots && !won;
  // runHeadlessGame import kept as documentation link for product path parity
  void runHeadlessGame;
  return {
    seed,
    shots,
    fouls: foulShots,
    foulPerShot: shots > 0 ? foulShots / shots : 0,
    completed: won && !capHit,
    capHit,
    winner,
  };
}

function main(): void {
  const harness = arg('harness') as Harness;
  const seed = num('seed');
  const rank0 = num('rank0');
  const rank1 = num('rank1');
  const rankLast = num('rankLast', 5);
  const maxShots = num('maxShots', 200);

  let row;
  if (harness === 'sp004') {
    row = runSp004(seed, rank0, rank1, rankLast, maxShots);
  } else if (harness === 'headless') {
    row = runHeadless(seed, rank0, rank1, maxShots);
  } else {
    throw new Error(`unknown harness: ${harness}`);
  }

  process.stdout.write(JSON.stringify(row) + '\n');
}

main();
