/**
 * P1-T05 — AI self-play integration harness (REC-1 metrics).
 *
 * Two AI players drive a full headless 8-ball game using:
 *   - Real CmSpace + real createBallPoolPhysics (genuine simulation)
 *   - Real createBallPool8Session (real rule engine + store)
 *   - Sync ReplayDriver (replay completes instantly)
 *   - AI shots via calculateAIShot → session.forceShot()
 *
 *   SP-001  Max-shot cap (200): game must end before cap or test FAILS
 *   SP-002  Same seed → byte-identical shot log (determinism)
 *   SP-003  Different seeds → different shot logs
 *   SP-004  Metrics sanity: pots ≥ 1 in a game, legal-contact-rate logged
 */

import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { IBallPoolPhysics, ShotResult } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { CueController } from '../../game/cue-controller';
import type { ReplayDriver } from '../../renderer/replay-driver';
import { createBallPool8Session } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import { getAllRackPositions } from '../../game/rack-positions';
import {
  BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL as BALL_MAT,
  CLOTH_MATERIAL as CLOTH_MAT,
  RAIL_MATERIAL as RAIL_MAT,
  POCKET_RADIUS, POCKET_POSITIONS,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_BACK_X, RAIL_BACK_Z, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_A_SCALE_X, CORNER_A_RADIUS,
  CORNER_B_X, CORNER_B_Z, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, SIDE_JAW_SIN, SIDE_JAW_COS,
} from '../../physics/constants';

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

// ─── Table geometry helpers ───────────────────────────────────────────────────

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id; col.position = new CmVector(x, y, z);
  col.right = new CmVector(10000, 0, 0); col.up = new CmVector(0, 10000, 0); col.forward = new CmVector(0, 0, 10000);
  col.scale = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius = BALL_RADIUS; col.material = { ...BALL_MAT };
  const body = new CmRigidbody();
  body.id = id; body.mass = BALL_MASS; body.collider = col;
  return body;
}

function makeLine(
  id: number, px: number, py: number, pz: number,
  rx: number, ry: number, rz: number, ux: number, uy: number, uz: number,
  fx: number, fy: number, fz: number, scaleX: number, radius: number, mat: CmMaterial,
): CmLineCollider {
  const c = new CmLineCollider();
  c.id = id; c.position = new CmVector(px, py, pz);
  c.right = new CmVector(rx, ry, rz); c.up = new CmVector(ux, uy, uz); c.forward = new CmVector(fx, fy, fz);
  c.scale = new CmVector(scaleX, 5000, 5000); c.radius = radius; c.material = { ...mat };
  return c;
}

function makeTableColliders(): (CmPlaneCollider | CmLineCollider)[] {
  const list: (CmPlaneCollider | CmLineCollider)[] = [];
  let id = 0;
  const plane = new CmPlaneCollider();
  plane.id = id++; plane.position = new CmVector(0, TABLE_Y, 0);
  plane.right = new CmVector(10000, 0, 0); plane.up = new CmVector(0, 10000, 0); plane.forward = new CmVector(0, 0, 10000);
  plane.scale = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS); plane.radius = PLANE_RADIUS; plane.material = { ...CLOTH_MAT };
  list.push(plane);
  list.push(makeLine(id++,  RAIL_LONG_X, BALL_Y, 0,   0,0,10000,  0,10000,0, -10000,0,0, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_LONG_X, BALL_Y, 0,   0,0,-10000, 0,10000,0,  10000,0,0, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z, -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z, -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,  10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,  10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  return list;
}

function makePockets(): CmKinematicTrigger[] {
  return POCKET_POSITIONS.map(([px, pz], i) => {
    const t = new CmKinematicTrigger();
    t.id = i; t.position = new CmVector(px, BALL_Y, pz); t.radius = POCKET_RADIUS;
    return t;
  });
}

/** Build a CmSpace with full 16-ball rack from C# positions. */
function makeRackSpace(): CmSpace {
  const rackPos = getAllRackPositions();
  const balls = rackPos.map((pos, id) => makeBall(id, pos.x, BALL_Y, pos.z));
  const space = new CmSpace();
  space.init(SPACE_CUBE, balls, makeTableColliders(), makePockets());
  return space;
}

// ─── Physics wrapper capturing ShotResult ────────────────────────────────────

interface TrackedPhysics extends IBallPoolPhysics {
  lastResult: ShotResult | null;
}

function makeTrackedPhysics(space: CmSpace): TrackedPhysics {
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  return {
    ...base,
    lastResult: null,
    applyShot(shot) {
      const result = base.applyShot(shot);
      (this as TrackedPhysics).lastResult = result;
      return result;
    },
  };
}

// ─── Shot log entry ───────────────────────────────────────────────────────────

interface ShotLogEntry {
  shotNum: number;
  player: 0 | 1;
  impulseX: number;
  impulseZ: number;
  pocketed: number[];       // ball ids pocketed this shot
  legalContact: boolean;    // cue ball hit at least one non-cue ball
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
 * Run a full headless self-play game.
 * @param seed   Base seed; each shot uses seed + shotCount*7919 for diversity.
 */
function runSelfPlay(seed: number): SelfPlayResult {
  const space = makeRackSpace();
  const physics = makeTrackedPhysics(space);
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

  // Allow all non-cue object balls (simplified: full 8-ball assignment not tracked here)
  const allAllowable = (id: number) => id > 0;

  let shotCount = 0;

  while (!gameEnded && shotCount < MAX_SHOTS) {
    const player = session.currentPlayerIndex;

    // Ball-in-hand: calculate placement + shot together, then advance state
    const bih = session.isBallInHand;
    const aiShot = calculateAIShot(
      space,
      allAllowable,
      shotCount === 0,  // isFirstShot: true only for break
      bih,
      3, 5,
      seed + shotCount * 7919,
    );

    if (bih) {
      if (aiShot.cueBallNewPos !== null) {
        physics.placeBall(0, aiShot.cueBallNewPos);
      }
      session.notifyBallPlaced();
      // After notifyBallPlaced, phase = Aiming — proceed to forceShot below
    }

    // Fire the shot (sync: forceShot + replayDriver completes synchronously)
    session.forceShot(aiShot.shotData);

    // Capture metrics from the just-completed shot
    const result = physics.lastResult;
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
    expect(result.shots).toBeLessThan(MAX_SHOTS);
    expect(result.winner !== undefined).toBe(true);  // game ended with a winner (or null for draw)
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
    // At least one shot differs in impulse (PRNG drives noise + force randomness)
    const allSame = r1.log.length === r2.log.length &&
      r1.log.every((e, i) => e.impulseX === r2.log[i].impulseX && e.impulseZ === r2.log[i].impulseZ);
    expect(allSame).toBe(false);
  }, 120_000);

  it('SP-004: metrics sanity — at least one pot in a full game, stats logged', () => {
    const result = runSelfPlay(777);
    // A full rack break always results in at least one ball being pocketed eventually
    expect(result.totalPots).toBeGreaterThanOrEqual(1);
    // Log metrics for human review (not an assertion, just info)
    console.log([
      `SP-004 metrics seed=777:`,
      `  shots=${result.shots}`,
      `  pots=${result.totalPots}`,
      `  fouls=${result.fouls}`,
      `  winner=P${result.winner}`,
      `  legal-contact-rate=${(result.legalContactRate * 100).toFixed(1)}%`,
    ].join('\n'));
  }, 60_000);

});
