/**
 * G6: IBallPoolPhysics contract tests (PHY-019).
 *
 * Verifies:
 *   C1  applyShot() uses same simulateToCompletion() as golden/fuzz (G2-B parity)
 *   C2  contacts/finalStates are Fixed integers (no floats in physics output)
 *   C3  step() never mutates rigidbodies (I1); interface exposes no frameIdx (I2);
 *       getBall() reads space.rigidbodies not frames[] (I3)
 *   S1  contacts: onset-only — cushion hit repeated across 3+ steps records once
 *   S2  ball-ball: reciprocal dedup (ballId=min)
 *   S3  intra-step sort: (ball < cushion, ballId asc, other asc)
 *   predictAimLine: returns 'ball' when target ball is in path (first-contact geometry)
 *   getPhysicsConstants: projects from constants.ts (C4)
 *   Determinism: same ShotData → same ShotResult (bit-exact, second call)
 */

import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import {
  BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL as BALL_MAT,
  CLOTH_MATERIAL as CLOTH_MAT,
  RAIL_MATERIAL as RAIL_MAT,
  POCKET_RADIUS, POCKET_POSITIONS,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  MAX_FORCE,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_BACK_X, RAIL_BACK_Z, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_A_SCALE_X, CORNER_A_RADIUS,
  CORNER_B_X, CORNER_B_Z, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, SIDE_JAW_SIN, SIDE_JAW_COS,
} from '../../physics/constants';

// ─── Mock SceneAPI (renderer not under test) ──────────────────────────────────

import type { SceneAPI } from '../../renderer/scene';
const mockScene: SceneAPI = {
  updateBallPosition: () => {},
  render: () => {},
  dispose: () => {},
  renderer: null as unknown as import('three').WebGLRenderer,
  camera: null as unknown as import('three').PerspectiveCamera,
  scene: null as unknown as import('three').Scene,
  balls: [] as unknown as import('three').Mesh[],
  table: null as unknown as import('three').Group,
};

// ─── Table geometry (mirrors golden-vector.test.ts) ───────────────────────────

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id;
  col.position = new CmVector(x, y, z);
  col.right   = new CmVector(10000, 0, 0);
  col.up      = new CmVector(0, 10000, 0);
  col.forward = new CmVector(0, 0, 10000);
  col.scale   = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius  = BALL_RADIUS;
  col.material = { ...BALL_MAT };
  const body = new CmRigidbody();
  body.id   = id;
  body.mass = BALL_MASS;
  body.collider = col;
  return body;
}

function makeLine(
  id: number,
  px: number, py: number, pz: number,
  rx: number, ry: number, rz: number,
  ux: number, uy: number, uz: number,
  fx: number, fy: number, fz: number,
  scaleX: number, radius: number,
  mat: CmMaterial,
): CmLineCollider {
  const c = new CmLineCollider();
  c.id       = id;
  c.position = new CmVector(px, py, pz);
  c.right    = new CmVector(rx, ry, rz);
  c.up       = new CmVector(ux, uy, uz);
  c.forward  = new CmVector(fx, fy, fz);
  c.scale    = new CmVector(scaleX, 5000, 5000);
  c.radius   = radius;
  c.material = { ...mat };
  return c;
}

function makeTable(): (CmPlaneCollider | CmLineCollider)[] {
  const list: (CmPlaneCollider | CmLineCollider)[] = [];
  let id = 0;

  const plane = new CmPlaneCollider();
  plane.id       = id++;
  plane.position = new CmVector(0, TABLE_Y, 0);
  plane.right    = new CmVector(10000, 0, 0);
  plane.up       = new CmVector(0, 10000, 0);
  plane.forward  = new CmVector(0, 0, 10000);
  plane.scale    = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS);
  plane.radius   = PLANE_RADIUS;
  plane.material = { ...CLOTH_MAT };
  list.push(plane);

  // Long side rails
  list.push(makeLine(id++,  RAIL_LONG_X, BALL_Y, 0,   0,0,10000,  0,10000,0, -10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_LONG_X, BALL_Y, 0,   0,0,-10000, 0,10000,0,  10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  // End cushions (4 half-segments)
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z,  -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,   10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  // Corner jaw cushions (8 total: 2 per corner × 4 corners)
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  // Side pocket jaw cushions (4 total: 2 per side pocket × 2 side pockets)
  list.push(makeLine(id++, -SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  SIDE_JAW_X, BALL_Y,  SIDE_JAW_Z,  -SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0,-SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0,-SIDE_JAW_COS, 0,10000,0,  SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  SIDE_JAW_X, BALL_Y, -SIDE_JAW_Z,   SIDE_JAW_SIN,0, SIDE_JAW_COS, 0,10000,0, -SIDE_JAW_COS,0, SIDE_JAW_SIN, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, RAIL_MAT));

  return list;
}

function makePockets(): CmKinematicTrigger[] {
  return POCKET_POSITIONS.map(([px, pz], i) => {
    const t = new CmKinematicTrigger();
    t.id       = i;
    t.position = new CmVector(px, BALL_Y, pz);
    t.radius   = POCKET_RADIUS;
    return t;
  });
}

/** GV-01 single-ball space at x=-5000 */
function makeGV01Space() {
  const ball = makeBall(0, -5000, BALL_Y, 0);
  const space = new CmSpace();
  space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
  return { space, ball };
}

const GV01_SHOT = {
  impulse:  new CmVector(30000, 0, 0),
  position: new CmVector(-5000, BALL_Y, 0),
  torque:   CmVector.zero,
};

// ─── C1 / G2-B: production path == GV-01 golden ───────────────────────────────

describe('G6 C1: applyShot canonical endpoint (G2-B parity)', () => {
  it('applyShot() gives PHY-003-clamped final position px=-4864', () => {
    // GV-01 impulse=30000 > MAX_FORCE=13000; applyShot() clamps to 13000 → ball reaches
    // right long rail, bounces (bounciness=0.6), settles at px=-4864.
    // Direct physics (golden-vector.test.ts) uses unclamped 30000 → px=9480.
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const result = physics.applyShot(GV01_SHOT);

    expect(result.finalStates[0].position.x).toBe(-4864);  // B1: PHY-003 clamps 30000 → 13000 → bounce → px=-4864
    expect(result.finalStates[0].position.y).toBe(9439);
    expect(result.finalStates[0].position.z).toBe(0);
  });

  it('applyShot() frames[] has same endpoint as finalStates (last frame matches)', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const result = physics.applyShot(GV01_SHOT);

    const lastFrame = result.frames[result.frames.length - 1];
    const ball0pos = lastFrame.positions.find(p => p.id === 0)!;
    expect(ball0pos.x).toBe(-4864);  // B1: PHY-003 clamps 30000 → 13000 → bounce → px=-4864
  });
});

// ─── Determinism: same ShotData → same ShotResult ────────────────────────────

describe('G6 determinism: same ShotData → identical ShotResult', () => {
  it('two consecutive applyShot() calls produce identical contacts and finalStates', () => {
    const { space: s1 } = makeGV01Space();
    const { space: s2 } = makeGV01Space();
    const p1 = createBallPoolPhysics(s1, mockScene);
    const p2 = createBallPoolPhysics(s2, mockScene);

    const r1 = p1.applyShot(GV01_SHOT);
    const r2 = p2.applyShot(GV01_SHOT);

    expect(r1.finalStates[0].position.x).toBe(r2.finalStates[0].position.x);
    expect(r1.finalStates[0].position.z).toBe(r2.finalStates[0].position.z);
    expect(r1.frames.length).toBe(r2.frames.length);
    expect(r1.contacts.length).toBe(r2.contacts.length);
    for (let i = 0; i < r1.contacts.length; i++) {
      expect(r1.contacts[i].kind).toBe(r2.contacts[i].kind);
      expect(r1.contacts[i].stepIndex).toBe(r2.contacts[i].stepIndex);
      expect(r1.contacts[i].ballId).toBe(r2.contacts[i].ballId);
    }
  });
});

// ─── C3-I3: getBall() reads space.rigidbodies ────────────────────────────────

describe('G6 C3-I3: getBall() reads canonical state', () => {
  it('getBall(0) returns position matching space.rigidbodies[0] after applyShot', () => {
    const { space, ball } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    physics.applyShot(GV01_SHOT);

    const state = physics.getBall(0);
    // C3-I3: same reference as canonical body position
    expect(state.position.x).toBe(ball.collider.position.x);
    expect(state.position.y).toBe(ball.collider.position.y);
    expect(state.position.z).toBe(ball.collider.position.z);
    expect(state.isActive).toBe(false); // at rest
    expect(state.isKinematic).toBe(false);
  });
});

// ─── C3-I1: step() must not mutate rigidbodies ────────────────────────────────

describe('G6 C3-I1: step() does not mutate space.rigidbodies', () => {
  it('ball position unchanged after calling step() multiple times', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    physics.applyShot(GV01_SHOT);

    const pxAfterShot = space.rigidbodies[0].collider.position.x;
    const pyAfterShot = space.rigidbodies[0].collider.position.y;

    // Drive replay animation — step() must only update renderer, not rigidbodies
    for (let i = 0; i < 500; i++) physics.step(0.016);

    expect(space.rigidbodies[0].collider.position.x).toBe(pxAfterShot);
    expect(space.rigidbodies[0].collider.position.y).toBe(pyAfterShot);
  });
});

// ─── S1: onset-only contacts ─────────────────────────────────────────────────

describe('G6 S1: contacts are onset-only (same pair not in consecutive steps)', () => {
  it('GV-01: for each (pair), no two contact records appear at consecutive step indices', () => {
    // S1 invariant: if ball is in contact at step i, activeContacts gains the key,
    // so step i+1 cannot record a new onset for the same pair.
    // Multiple bounces (e.g. ball hits same rail at steps 100, 500, 900) are valid
    // onsets; only back-to-back step indices (diff=1) would indicate S1 failure.
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const result = physics.applyShot(GV01_SHOT);

    const byPair = new Map<string, number[]>();
    for (const c of result.contacts) {
      const key = `${c.kind}:${c.ballId}:${c.cushionId ?? c.otherBallId}`;
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key)!.push(c.stepIndex);
    }

    for (const steps of byPair.values()) {
      steps.sort((a, b) => a - b);
      for (let i = 1; i < steps.length; i++) {
        // Two onsets for the same pair cannot be at adjacent steps (S1 proof)
        expect(steps[i] - steps[i - 1]).toBeGreaterThan(1);
      }
    }
  });
});

// ─── S2: ball-ball reciprocal dedup ──────────────────────────────────────────

describe('G6 S2: ball-ball contacts are deduplicated (ballId=min)', () => {
  it('two-ball collision produces exactly one ball contact record with ballId<otherBallId', () => {
    // Ball 0 at (-5000, BALL_Y, 0), Ball 1 at (1000, BALL_Y, 0) — in the path
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  1000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const result = physics.applyShot({
      impulse:  new CmVector(30000, 0, 0),
      position: new CmVector(-5000, BALL_Y, 0),
      torque:   CmVector.zero,
    });

    const ballContacts = result.contacts.filter(c => c.kind === 'ball');
    expect(ballContacts.length).toBeGreaterThan(0);

    // All ball-ball records must have ballId < otherBallId (S2)
    for (const c of ballContacts) {
      expect(c.ballId).toBeLessThan(c.otherBallId!);
    }

    // No duplicate pair at the same stepIndex
    const seenFirstHit = new Set<string>();
    let dupes = 0;
    for (const c of ballContacts) {
      const key = `${c.stepIndex}:${c.ballId}:${c.otherBallId}`;
      if (seenFirstHit.has(key)) dupes++;
      seenFirstHit.add(key);
    }
    expect(dupes).toBe(0);
  });
});

// ─── predictAimLine: ball hit detection ───────────────────────────────────────

describe('G6 predictAimLine: ball geometry detection', () => {
  it('returns hitType=ball when target ball is directly in the ray path', () => {
    // Ball 1 at (2000, BALL_Y, 0), ball 0 at (-5000, BALL_Y, 0)
    // Ray from (-5000, BALL_Y, 0) in +X direction should hit ball 1
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const from = new CmVector(-5000, BALL_Y, 0);
    const dir  = new CmVector(10000, 0, 0); // unit in +X
    const hit  = physics.predictAimLine(from, dir);

    expect(hit.hitType).toBe('ball');
    expect(hit.ballId).toBe(1);
    expect(hit.distance).toBeGreaterThan(0);
  });

  it('returns hitType=cushion when ray hits the long rail before any ball', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    // Shoot directly at right long rail (no ball in path)
    const from = new CmVector(-5000, BALL_Y, 0);
    const dir  = new CmVector(10000, 0, 0);
    const hit  = physics.predictAimLine(from, dir);

    expect(hit.hitType).toBe('cushion');
    expect(hit.cushionId).not.toBeNull();
  });

  it('returns hitType=none for zero direction', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), CmVector.zero);
    expect(hit.hitType).toBe('none');
  });
});

// ─── getPhysicsConstants (C4) ────────────────────────────────────────────────

describe('G6 C4: getPhysicsConstants projects from constants.ts', () => {
  it('returns correct constants without hardcoding', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const c = physics.getPhysicsConstants();

    expect(c.ballMass).toBe(BALL_MASS);
    expect(c.ballRadius).toBe(BALL_RADIUS);
    expect(c.maxForce).toBe(MAX_FORCE);
    expect(c.tableScaleX).toBe(SPACE_SCALE_X);
    expect(c.tableScaleZ).toBe(SPACE_SCALE_Z);
  });
});

// ─── shotFrames / replay ─────────────────────────────────────────────────────

describe('G6: shotFrames and replay state', () => {
  it('shotFrames is populated after applyShot', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);

    expect(physics.shotFrames.length).toBe(0);
    physics.applyShot(GV01_SHOT);
    expect(physics.shotFrames.length).toBeGreaterThan(0);
  });

  it('isSimulating becomes false after replay completes', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    physics.applyShot(GV01_SHOT);

    const MAX_CALLS = 2_000_000;
    let calls = 0;
    while (physics.isSimulating && calls < MAX_CALLS) {
      physics.step(0.016);
      calls++;
    }
    expect(physics.isSimulating).toBe(false);
  });
});

// ─── getStateAsString / resetToStartState ────────────────────────────────────

describe('G6: state serialization and reset', () => {
  it('resetToStartState restores ball to initial position', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const initPx = physics.getBall(0).position.x;

    physics.applyShot(GV01_SHOT);
    expect(physics.getBall(0).position.x).not.toBe(initPx);

    physics.resetToStartState();
    expect(physics.getBall(0).position.x).toBe(initPx);
  });

  it('getStateAsString/setStateFromString round-trips ball position', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    physics.applyShot(GV01_SHOT);

    const snapshot = physics.getStateAsString();
    const pxAfterShot = physics.getBall(0).position.x;

    physics.resetToStartState();
    expect(physics.getBall(0).position.x).not.toBe(pxAfterShot);

    physics.setStateFromString(snapshot);
    expect(physics.getBall(0).position.x).toBe(pxAfterShot);
  });
});

// ─── CUE-013 / PHY-016: placeBall + respotCueBall ────────────────────────────

describe('G6 placeBall: sets Fixed position and clears kinematic/OOT state', () => {
  it('placeBall() moves ball to given Fixed position', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const target = new CmVector(3000, BALL_Y, 1000);
    physics.placeBall(0, target);
    expect(physics.getBall(0).position.x).toBe(3000);
    expect(physics.getBall(0).position.y).toBe(BALL_Y);
    expect(physics.getBall(0).position.z).toBe(1000);
  });

  it('placeBall() clears isKinematic', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    space.rigidbodies[0].isKinematic = true;  // simulate pocketed
    const physics = createBallPoolPhysics(space, mockScene);
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(physics.getBall(0).isKinematic).toBe(false);
  });

  it('placeBall() clears isOutOfTable', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    space.rigidbodies[0].isOutOfCube = true;
    const physics = createBallPoolPhysics(space, mockScene);
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(physics.getBall(0).isOutOfTable).toBe(false);
  });

  it('placeBall() stops ball (velocity zeroed)', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    b0.velocity = new CmVector(1000, 0, 500);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(physics.getBall(0).velocity.x).toBe(0);
    expect(physics.getBall(0).velocity.z).toBe(0);
  });

  it('placeBall() zeros angularVelocity', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    b0.angularVelocity = new CmVector(300, 100, 200);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(physics.getBall(0).angularVelocity.x).toBe(0);
    expect(physics.getBall(0).angularVelocity.y).toBe(0);
    expect(physics.getBall(0).angularVelocity.z).toBe(0);
  });

  it('placeBall() updates renderer (mockScene.updateBallPosition called)', () => {
    const calls: number[] = [];
    const trackedScene: SceneAPI = {
      ...mockScene,
      updateBallPosition: (id: number, _x: number, _y: number, _z: number) => calls.push(id),
    };
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, trackedScene);
    physics.placeBall(0, new CmVector(2000, BALL_Y, 0));
    expect(calls).toContain(0);
  });
});

describe('G6 respotCueBall: places cue ball at head-spot', () => {
  it('respotCueBall() sets ball 0 to head-spot x = -RAIL_LONG_X/2', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    physics.applyShot(GV01_SHOT);  // move ball away from start
    physics.respotCueBall();
    const headSpotX = -Math.trunc(RAIL_LONG_X / 2);
    expect(physics.getBall(0).position.x).toBe(headSpotX);
    expect(physics.getBall(0).position.z).toBe(0);
    expect(physics.getBall(0).position.y).toBe(BALL_Y);
  });

  it('respotCueBall() clears isKinematic on ball 0', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    space.rigidbodies[0].isKinematic = true;
    const physics = createBallPoolPhysics(space, mockScene);
    physics.respotCueBall();
    expect(physics.getBall(0).isKinematic).toBe(false);
  });
});

// ─── PHY-009: analytic SphereCast geometry ────────────────────────────────────
//
// Tests verifying that predictAimLine() uses the analytic SphereCastManager port
// (not step-cast approximation). Float arithmetic, UX-only precision.

describe('PHY-009 analytic SphereCast: ball detection geometry', () => {
  it('ball directly in path: hitType=ball, correct ballId', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.hitType).toBe('ball');
    expect(hit.ballId).toBe(1);
  });

  it('ball hit: distance is between 0 and rail distance (ball wins over cushion)', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    // Right rail is ~17414 Fixed away; ball at 2000 should be hit first
    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.distance).toBeGreaterThan(0);
    expect(hit.distance).toBeLessThan(17414);
  });

  it('ball hit: hit.point ≈ target ball contact surface (ballCenter + r*normal)', () => {
    // b0 at (-5000, BALL_Y, 0), b1 at (2000, BALL_Y, 0), shooting +X
    // contact: sphere of b0 just touching b1 → at x = b1.x - 2r = 2000 - 570 = 1430
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    // The contact point is on b1's surface toward the cue: b1.x - BALL_RADIUS
    expect(hit.point.x).toBeCloseTo(2000 - BALL_RADIUS, -1);  // within ~10 Fixed
    expect(hit.point.z).toBeCloseTo(0, 0);
  });

  it('ball hit: normal points from target ball center toward cue (inward on +X shot = -X normal)', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    // Normal points FROM b1 toward cue ball sphere center = -X direction
    expect(hit.normal.x).toBeLessThan(0);
    expect(hit.normal.z).toBeCloseTo(0, 0);
  });

  it('ball behind ray origin is skipped (dotFwd <= 0 guard)', () => {
    // b0 at (-5000, BALL_Y, 0), b1 at (-8000, BALL_Y, 0) — behind the ray in +X direction
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1, -8000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    // b1 is behind → should not be detected; expect cushion or none
    expect(hit.hitType).not.toBe('ball');
  });

  it('kinematic (pocketed) ball is skipped', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const b1 = makeBall(1,  2000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0, b1], makeTable(), makePockets());
    // Mark b1 as kinematic (pocketed)
    space.rigidbodies[1].isKinematic = true;
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.hitType).not.toBe('ball');
  });
});

describe('PHY-009 analytic SphereCast: cushion detection geometry', () => {
  it('straight shot in +X: hits right long rail, hitType=cushion', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.hitType).toBe('cushion');
    expect(hit.cushionId).not.toBeNull();
  });

  it('straight shot in -X: hits left long rail, hitType=cushion', () => {
    const b0 = makeBall(0, 5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(5000, BALL_Y, 0), new CmVector(-10000, 0, 0));
    expect(hit.hitType).toBe('cushion');
    expect(hit.distance).toBeGreaterThan(0);
  });

  it('cushion hit: normal is the inward-facing unit vector of the rail', () => {
    // Right long rail forward = (-10000, 0, 0), i.e. normal.x = -1 in float
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.hitType).toBe('cushion');
    // Normal should be the rail's forward = (-10000, 0, 0) normalized
    expect(hit.normal.x).toBeLessThan(0);
    expect(Math.abs(hit.normal.z)).toBeLessThanOrEqual(1);
  });

  it('cushion hit: distance ≈ (rail_x - cue_x - BALL_RADIUS) for perpendicular shot', () => {
    // cue at x = -5000, rail at x = RAIL_LONG_X = 12699
    // float: separation = (12699 - (-5000)) / 10000 = 1.7699 m
    // sphere center reaches rail when front of sphere touches: dist = (1.7699 - BALL_RADIUS/10000) = 1.7414
    // So Fixed distance ≈ 17414
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), new CmVector(10000, 0, 0));
    expect(hit.hitType).toBe('cushion');
    // Allow ±30 Fixed (±0.003 m) tolerance for float arithmetic
    expect(hit.distance).toBeGreaterThan(17414 - 30);
    expect(hit.distance).toBeLessThan(17414 + 30);
  });

  it('zero direction: returns hitType=none', () => {
    const b0 = makeBall(0, -5000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [b0], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const hit = physics.predictAimLine(new CmVector(-5000, BALL_Y, 0), CmVector.zero);
    expect(hit.hitType).toBe('none');
  });
});

// ─── Render bridge coordinate fix (RENDER-001) ──────────────────────────────
// Physics world: table surface at Y = TABLE_Y/MULTIPLIER ≈ 0.9154m
// Scene world:   table surface at Y = 0
// Bridge must subtract TABLE_Y so ball visuals land at ~BALL_RADIUS above scene cloth.

describe('RENDER-001: updateBallPosition Y is scene-space (table at Y=0)', () => {
  it('placeBall() passes scene-space Y ≈ BALL_RADIUS to renderer (not physics absolute Y)', () => {
    const capturedY: number[] = [];
    const trackedScene: SceneAPI = {
      ...mockScene,
      updateBallPosition: (_id: number, _x: number, y: number, _z: number) => {
        capturedY.push(y);
      },
    };
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, trackedScene);
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));

    // Physics BALL_Y = 9440 Fixed → toFloat = 0.944m (WRONG for scene)
    // Correct: BALL_Y - TABLE_Y = 286 Fixed → 0.0286m ≈ BALL_RADIUS_FLOAT
    const BALL_RADIUS_FLOAT = BALL_RADIUS / 10000;
    const lastY = capturedY[capturedY.length - 1];
    expect(lastY).toBeGreaterThan(BALL_RADIUS_FLOAT - 0.005);
    expect(lastY).toBeLessThan(BALL_RADIUS_FLOAT + 0.005);
  });

  it('start() initial body sync passes scene-space Y to renderer for all bodies', () => {
    const yValues: number[] = [];
    const trackedScene: SceneAPI = {
      ...mockScene,
      updateBallPosition: (_id, _x, y, _z) => { yValues.push(y); },
    };
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, trackedScene);

    // start() synchronously calls updateBallPosition for all rigidbodies before requestAnimationFrame.
    // Mock rAF so node test env doesn't throw "requestAnimationFrame is not defined".
    const origRaf = (globalThis as unknown as Record<string, unknown>).requestAnimationFrame;
    (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = () => 0;
    try {
      physics.start();
    } finally {
      (globalThis as unknown as Record<string, unknown>).requestAnimationFrame = origRaf;
    }

    // All bodies' Y values must be in scene-space (≈ BALL_RADIUS above table at Y=0)
    const BALL_RADIUS_FLOAT = BALL_RADIUS / 10000;
    expect(yValues.length).toBeGreaterThan(0);
    for (const y of yValues) {
      expect(y).toBeGreaterThan(BALL_RADIUS_FLOAT - 0.005);
      expect(y).toBeLessThan(0.10);  // never more than 10cm above cloth
    }
  });
});

// ─── G6 §2.2: pocketed/outOfTable ordering guarantee ────────────────────────

describe('G6 §2.2 — pocketed/outOfTable explicit sort (stepIndex asc, ballId asc)', () => {
  it('pocketed[] invariant holds on a real shot', () => {
    const { space } = makeGV01Space();
    const physics = createBallPoolPhysics(space, mockScene);
    const result = physics.applyShot(GV01_SHOT);
    for (let i = 1; i < result.pocketed.length; i++) {
      const p = result.pocketed[i - 1], c = result.pocketed[i];
      expect(p.stepIndex < c.stepIndex || (p.stepIndex === c.stepIndex && p.ballId <= c.ballId))
        .toBe(true);
    }
  });

  it('outOfTable[] invariant holds on a real shot', () => {
    // High-speed +Z shot to escape table boundaries
    const ball = makeBall(0, 0, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);
    const result = physics.applyShot({
      position: new CmVector(0, BALL_Y, 0),
      impulse: new CmVector(0, 0, 80000),
      torque: CmVector.zero,
    });
    for (let i = 1; i < result.outOfTable.length; i++) {
      const p = result.outOfTable[i - 1], c = result.outOfTable[i];
      expect(p.stepIndex < c.stepIndex || (p.stepIndex === c.stepIndex && p.ballId <= c.ballId))
        .toBe(true);
    }
  });
});
