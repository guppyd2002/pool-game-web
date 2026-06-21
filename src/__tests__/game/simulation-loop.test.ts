/**
 * G2: simulation-loop full-simulate-then-replay determinism tests.
 *
 * Architecture (post-G2 fix):
 *   applyShot() runs the canonical integer loop to completion synchronously.
 *   The float accumulator in step() only paces replay animation — it never calls
 *   space.calculate() and therefore never gates physics step count.
 *
 * G2-A: Two independent calls to applyShot() with different dt arguments produce
 *   bit-exact final positions and calculateTime.  (dt is now irrelevant to physics;
 *   this is trivially true but confirms the canonical loop is self-consistent.)
 *
 * G2-B: The production applyShot() path produces px=-4864 via PHY-003 clamp.
 *   GV-01 impulse=30000 > MAX_FORCE=13000 → applyShot() clamps to 13000 → ball reaches
 *   right long rail (x≈12699), bounces (bounciness=0.6), and settles at px=-4864.
 *   Direct physics (golden-vector tests) uses unclamped 30000 → px=9480.
 *   B1 fix updated MAX_FORCE 9100→13000 (premium cue: 1.3×1.0×10000); stronger impulse
 *   now carries ball past the old stopping point to the far rail.
 *
 * GV-01 scenario: single ball at (-5000, 9440, 0), impulse (30000, 0, 0), mass=1700.
 * GV-01 direct-physics final: px=9480. applyShot() final after PHY-003 clamp: px=-4864.
 * (G9 B: CLOTH_MATERIAL updated to Game.unity runtime values — lower friction → ball rolls farther)
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { createSimulationLoop } from '../../game/simulation-loop';
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

// ─── SceneAPI mock ────────────────────────────────────────────────────────────

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

// ─── Full table geometry ──────────────────────────────────────────────────────

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBallGV(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id;
  col.position = new CmVector(x, y, z);
  col.right    = new CmVector(10000, 0, 0);
  col.up       = new CmVector(0, 10000, 0);
  col.forward  = new CmVector(0, 0, 10000);
  col.scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius   = BALL_RADIUS;
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

function makeGV01Space(): { space: CmSpace; ball: CmRigidbody } {
  const ball = makeBallGV(0, -5000, BALL_Y, 0);
  const space = new CmSpace();
  space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
  return { space, ball };
}

// ─── Drive simulation via applyShot() — for G2-B canonical endpoint check ───

function runToStop(_dt?: number): { px: number; py: number; pz: number; calculateTime: number } {
  const { space, ball } = makeGV01Space();
  const loop = createSimulationLoop(space, mockScene);
  loop.applyShot({
    impulse:  new CmVector(30000, 0, 0),
    position: new CmVector(ball.collider.position.x, ball.collider.position.y, ball.collider.position.z),
    torque:   CmVector.zero,
  });
  return {
    px: ball.collider.position.x,
    py: ball.collider.position.y,
    pz: ball.collider.position.z,
    calculateTime: space.calculateTime,
  };
}

// ─── Drive replay via step() — real render-path dt regression guard ───────────
//
// applyShot() runs physics synchronously to rest.  step(dt) then paces replay.
// If step() ever re-introduced space.calculate() calls, dt would gate physics and
// the last rendered position would differ across dt values — this test catches that.

function replayToEnd(dt: number): { lastPxFixed: number; lastPyFixed: number; lastPzFixed: number } {
  const { space, ball } = makeGV01Space();

  let lastPx = 0, lastPy = 0, lastPz = 0;
  const trackingScene: SceneAPI = {
    ...mockScene,
    updateBallPosition: (id: number, x: number, y: number, z: number) => {
      if (id === 0) { lastPx = x; lastPy = y; lastPz = z; }
    },
  };

  const loop = createSimulationLoop(space, trackingScene);
  loop.applyShot({
    impulse:  new CmVector(30000, 0, 0),
    position: new CmVector(ball.collider.position.x, ball.collider.position.y, ball.collider.position.z),
    torque:   CmVector.zero,
  });

  const MAX_STEP_CALLS = 1_000_000;
  let calls = 0;
  while (loop.isSimulating && calls < MAX_STEP_CALLS) {
    loop.step(dt);
    calls++;
  }

  return {
    lastPxFixed: Math.round(lastPx * 10000),
    lastPyFixed: Math.round(lastPy * 10000),
    lastPzFixed: Math.round(lastPz * 10000),
  };
}

// ─── Test A: render-path dt regression guard ─────────────────────────────────

describe('G2: simulation-loop full-simulate-then-replay determinism', () => {
  it('G2-A: replay with dt=0.016 → last rendered position == GV-01 canonical endpoint', () => {
    // Drives the actual step() replay path and checks the final scene position.
    // Pre-G2 regression: if step() gated physics via float accumulator, different dt
    // would run different step counts → different final positions.
    const r = replayToEnd(0.016);
    console.log(`[G2-A dt=0.016] lastPxFixed=${r.lastPxFixed} lastPyFixed=${r.lastPyFixed}`);
    expect(r.lastPxFixed).toBe(-4864);  // B1: clamps 30000→13000; ball bounces right rail → px=-4864
    expect(r.lastPyFixed).toBe(9439);
    expect(r.lastPzFixed).toBe(0);
  });

  it('G2-A KEY: replay endpoint is float-exact across dt=0.016 vs dt=0.033', () => {
    // If step() re-introduced accumulator-gated physics, dt=0.016 and dt=0.033 would
    // consume different numbers of physics steps and produce different final positions.
    const r1 = replayToEnd(0.016);
    const r2 = replayToEnd(0.033);

    console.log(`[G2-A] dt=0.016 lastPxFixed=${r1.lastPxFixed} | dt=0.033 lastPxFixed=${r2.lastPxFixed}`);

    expect(r1.lastPxFixed).toBe(r2.lastPxFixed);
    expect(r1.lastPyFixed).toBe(r2.lastPyFixed);
    expect(r1.lastPzFixed).toBe(r2.lastPzFixed);
  });

  it('G2-A: replay endpoint float-exact for dt=0.002 vs dt=0.050', () => {
    const r1 = replayToEnd(0.002);
    const r2 = replayToEnd(0.050);

    console.log(`[G2-A] dt=0.002 lastPxFixed=${r1.lastPxFixed} | dt=0.050 lastPxFixed=${r2.lastPxFixed}`);

    expect(r1.lastPxFixed).toBe(r2.lastPxFixed);
    expect(r1.lastPyFixed).toBe(r2.lastPyFixed);
    expect(r1.lastPzFixed).toBe(r2.lastPzFixed);
  });
});

// ─── Test B: production path == golden (G2-B) ────────────────────────────────

describe('G2-B: production path final position == GV-01 golden', () => {
  it('G2-B: applyShot() canonical loop gives px=-4864 (PHY-003 clamped)', () => {
    // applyShot() applies PHY-003: clamps impulse magnitude to MAX_FORCE before calling physics.
    // GV-01 impulse=30000 > MAX_FORCE=13000 → clamped to 13000 → ball reaches right long rail,
    // bounces (bounciness=0.6), and settles at px=-4864.
    // Direct physics path (golden-vector.test.ts) uses unclamped 30000 → px=9480.
    const r = runToStop(0.016);
    console.log(`[G2-B] production result: px=${r.px}, py=${r.py}, pz=${r.pz}`);
    expect(r.px).toBe(-4864);  // B1: PHY-003 clamps 30000 → 13000 → bounce → px=-4864
    expect(r.py).toBe(9439);
    expect(r.pz).toBe(0);
  });
});
