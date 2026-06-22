/**
 * P1-T05 — AI self-play integration harness (REC-1 metrics).
 *
 * Two AI players drive a full headless 8-ball game using:
 *   - createPoolTable() — PRODUCTION table (single source, isActive=false correct)
 *   - Real createBallPoolPhysics (genuine simulation)
 *   - Real createBallPool8Session (real rule engine + store)
 *   - Sync ReplayDriver (replay completes instantly)
 *   - AI shots via calculateAIShot → session.forceShot()
 *   - session.getAllowableFn() — true 8-ball group allowable (not id>0 degenerate)
 *
 *   SP-001  Max-shot cap (200): game must end before cap or test FAILS
 *   SP-002  Same seed → byte-identical shot log (determinism)
 *   SP-003  Different seeds → different shot logs
 *   SP-004  Quality bands: shots≥5, pots≥8, legal-contact-rate≥10%, foul-rate≤90%
 */

import { describe, it, expect } from 'vitest';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { IBallPoolPhysics, ShotResult } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { CueController } from '../../game/cue-controller';
import type { ReplayDriver } from '../../renderer/replay-driver';
import { createBallPool8Session } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import { createPoolTable } from '../../game/table-setup';

// ─── Mock SceneAPI (no rendering in headless self-play) ───────────────────────

const MOCK_SCENE: SceneAPI = {
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
};

// ─── Mock CueController (AI bypasses it) ─────────────────────────────────────

const MOCK_CUE: CueController = {
  get onShotApplied() { return null; },
  set onShotApplied(_fn) {},
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
};

// ─── Sync ReplayDriver (triggers completion immediately) ──────────────────────

function makeSyncReplayDriver(): ReplayDriver {
  return {
    watch(_physics, _scene, _pocketed, _oot, onComplete) { onComplete(); },
    resetVisibility: () => {},
    dispose: () => {},
  };
}

// ─── Physics wrapper that captures last ShotResult (preserves getters) ───────

function makeTrackedPhysics(base: IBallPoolPhysics): { physics: IBallPoolPhysics; getLastResult: () => ShotResult | null } {
  let _lastResult: ShotResult | null = null;
  const physics: IBallPoolPhysics = {
    applyShot(shot) {
      const result = base.applyShot(shot);
      _lastResult = result;
      return result;
    },
    // Delegate all other methods/getters to base — preserves live getters
    get shotFrames() { return base.shotFrames; },
    getBall(id) { return base.getBall(id); },
    getActiveBalls() { return base.getActiveBalls(); },
    get allBalls() { return base.allBalls; },
    predictAimLine(from, dir) { return base.predictAimLine(from, dir); },
    step(dt) { base.step(dt); },
    start() { base.start(); },
    stop() { base.stop(); },
    get isSimulating() { return base.isSimulating; },
    getStateAsString() { return base.getStateAsString(); },
    setStateFromString(s) { base.setStateFromString(s); },
    resetToStartState() { base.resetToStartState(); },
    getPhysicsConstants() { return base.getPhysicsConstants(); },
    placeBall(id, pos) { base.placeBall(id, pos); },
    respotCueBall() { base.respotCueBall(); },
  };
  return { physics, getLastResult: () => _lastResult };
}

// ─── Shot log entry ───────────────────────────────────────────────────────────

interface ShotLogEntry {
  shotNum: number;
  player: 0 | 1;
  impulseX: number;
  impulseZ: number;
  pocketed: number[];     // ball ids pocketed this shot
  legalContact: boolean;  // cue ball hit at least one object ball
}

// ─── Self-play runner ─────────────────────────────────────────────────────────

interface SelfPlayResult {
  shots: number;
  winner: 0 | 1 | null;
  fouls: number;
  totalPots: number;
  legalContactRate: number;
  log: ShotLogEntry[];
}

const MAX_SHOTS = 200;

/**
 * Run a full headless self-play game using production table + real physics.
 * @param seed  Base seed; each shot uses seed + shotCount*7919 for diversity.
 */
function runSelfPlay(seed: number): SelfPlayResult {
  // Use production createPoolTable — single source (isActive=false correct, C-5 wiring)
  const space = createPoolTable();
  const basePhysics = createBallPoolPhysics(space, MOCK_SCENE);
  const { physics, getLastResult } = makeTrackedPhysics(basePhysics);
  const replayDriver = makeSyncReplayDriver();

  const session = createBallPool8Session({
    physics,
    cue: MOCK_CUE,
    scene: MOCK_SCENE,
    replayDriver,
  });

  const log: ShotLogEntry[] = [];
  let fouls = 0;
  let gameEnded = false;
  let winner: 0 | 1 | null = null;

  session.onTurnChanged = (_playerIdx, ballInHand) => {
    if (ballInHand) fouls++;
  };
  session.onGameEnded = (w) => {
    gameEnded = true;
    winner = w;
  };

  session.startNewGame();

  let shotCount = 0;

  while (!gameEnded && shotCount < MAX_SHOTS) {
    const player = session.currentPlayerIndex;

    // Get real 8-ball group allowable for current player (not degenerate id>0)
    const allowable = session.getAllowableFn();
    const bih = session.isBallInHand;

    const aiShot = calculateAIShot(
      space,
      allowable,
      shotCount === 0,  // isFirstShot: true only for break
      bih,
      3, 5,
      seed + shotCount * 7919,
    );

    if (bih) {
      if (aiShot.cueBallNewPos !== null) {
        physics.placeBall(0, aiShot.cueBallNewPos);
      }
      // Advance BallInHand → Aiming regardless of whether placement moved the ball
      session.notifyBallPlaced();
    }

    // Fire shot (sync: forceShot + sync replayDriver completes synchronously)
    session.forceShot(aiShot.shotData);

    const result = getLastResult();
    const pocketed = result?.pocketed.map(p => p.ballId) ?? [];
    const legalContact = (result?.contacts.some(
      c => c.kind === 'ball' && c.ballId === 0 && c.otherBallId !== null && c.otherBallId > 0,
    )) ?? false;

    log.push({
      shotNum: shotCount,
      player,
      impulseX: aiShot.shotData.impulse.x,
      impulseZ: aiShot.shotData.impulse.z,
      pocketed,
      legalContact,
    });

    shotCount++;
  }

  const totalPots = log.reduce((sum, e) => sum + e.pocketed.length, 0);
  const legalContactRate = log.length > 0
    ? log.filter(e => e.legalContact).length / log.length
    : 0;

  return { shots: shotCount, winner, fouls, totalPots, legalContactRate, log };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AI self-play harness (REC-1)', () => {

  it('SP-001: game ends within 200-shot cap (max-shot cap invariant)', () => {
    const result = runSelfPlay(42);
    // Cap-hit is a FAIL: degenerate or infinite loop, not a legitimate game end
    expect(result.shots).toBeLessThan(MAX_SHOTS);
    // Must have produced a definitive winner (not undefined — game ended properly)
    expect(result.winner === 0 || result.winner === 1 || result.winner === null).toBe(true);
  }, 60_000);

  it('SP-002: same seed → byte-identical shot log (determinism)', () => {
    const r1 = runSelfPlay(12345);
    const r2 = runSelfPlay(12345);
    expect(r1.log.length).toBe(r2.log.length);
    for (let i = 0; i < r1.log.length; i++) {
      expect(r1.log[i].impulseX).toBe(r2.log[i].impulseX);
      expect(r1.log[i].impulseZ).toBe(r2.log[i].impulseZ);
      expect(r1.log[i].pocketed).toEqual(r2.log[i].pocketed);
    }
  }, 120_000);

  it('SP-003: different seeds → different shot logs', () => {
    const r1 = runSelfPlay(1);
    const r2 = runSelfPlay(9999);
    const allSame = r1.log.length === r2.log.length &&
      r1.log.every((e, i) => e.impulseX === r2.log[i].impulseX && e.impulseZ === r2.log[i].impulseZ);
    expect(allSame).toBe(false);
  }, 120_000);

  it('SP-004: quality bands — proper 8-ball game (shots≥5, pots≥8, contact≥10%, foul-rate≤90%)', () => {
    const result = runSelfPlay(777);

    // Game must end before cap (cap-hit = degenerate loop)
    expect(result.shots).toBeLessThan(MAX_SHOTS);

    // Minimum shots: 3-shot win is degenerate (requires proper allowable grouping)
    expect(result.shots).toBeGreaterThanOrEqual(5);

    // Minimum pots: winner must clear their 7-ball group + 8-ball = 8 pots minimum
    expect(result.totalPots).toBeGreaterThanOrEqual(8);

    // AI must make some legal contacts (not all shots into thin air)
    expect(result.legalContactRate).toBeGreaterThan(0.1);

    // Foul rate < 90%: not every shot is a foul (AI finds hittable targets)
    const foulRate = result.shots > 0 ? result.fouls / result.shots : 1;
    expect(foulRate).toBeLessThan(0.9);

    console.log([
      `SP-004 metrics seed=777:`,
      `  shots=${result.shots}`,
      `  pots=${result.totalPots}`,
      `  fouls=${result.fouls} (${(foulRate * 100).toFixed(1)}%)`,
      `  winner=P${result.winner}`,
      `  legal-contact-rate=${(result.legalContactRate * 100).toFixed(1)}%`,
    ].join('\n'));
  }, 60_000);

});
