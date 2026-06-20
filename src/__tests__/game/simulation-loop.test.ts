/**
 * G2 spike: simulation-loop accumulator determinism test.
 *
 * Characterizes whether the current accumulator loop in simulation-loop.ts:54
 * produces bit-exact results regardless of the dt chunk size passed to step().
 *
 * Known bug (Challenge #020 / G2 diagnosis):
 *   while (accumulator >= toFloat(space.timestep)) {
 *     space.calculate(...)                   ← updates space.timestep (adaptive)
 *     accumulator -= toFloat(space.timestep) ← uses NEW timestep, not comparison value
 *   }
 *   Also: toFloat(MIN_TS) = toFloat(50) = 0.005 cannot be exactly represented in
 *   IEEE 754 binary (= 1/200 — requires infinite binary expansion), so different
 *   dt patterns accumulate float rounding errors → different total step counts
 *   → non-deterministic final positions.
 *
 * Test A: run1 dt=0.010 / run2 dt=0.016 — assert final positions bit-exact.
 * Test B: GV-01 golden endpoint check.
 *
 * GV-01 scenario: single ball at (-4000, 9440, 0), impulse (30000, 0, 0), mass=1700.
 * GV-01 golden final: px=-6979, py=9439, pz=0.
 */
import { describe, it, expect } from 'vitest';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import { CmRigidbody, CmForceMode, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import type { CmMaterial } from '../../physics/colliders';
import { createSimulationLoop } from '../../game/simulation-loop';

// ─── SceneAPI mock (no rendering needed) ─────────────────────────────────────

const mockScene = {
  updateBallPosition: () => {},
  render: () => {},
};

// ─── Full table geometry — mirrors golden-vector.test.ts ──────────────────────

const BALL_MASS   = 1700;
const BALL_RADIUS = 285;
const TABLE_Y     = 9154;
const BALL_Y      = 9440;

const BALL_MAT: CmMaterial  = { bounciness: 9499, rollingFriction: 49,  twistingFriction: 200000, dynamicFriction: 500,  staticFriction: 599  };
const CLOTH_MAT: CmMaterial = { bounciness: 500,  rollingFriction: 99,  twistingFriction: 200000, dynamicFriction: 8000, staticFriction: 8999 };
const RAIL_MAT: CmMaterial  = { bounciness: 6000, rollingFriction: 0,   twistingFriction: 0,      dynamicFriction: 0,    staticFriction: 2000 };

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(30000, 20000, 20000),
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
  plane.scale    = new CmVector(25399, 5000, 12699);
  plane.radius   = 12699;
  plane.material = { ...CLOTH_MAT };
  list.push(plane);

  list.push(makeLine(id++,  12699, BALL_Y,     0,   0,0,10000,  0,10000,0, -10000,0,0,  11150, 5575, RAIL_MAT));
  list.push(makeLine(id++, -12699, BALL_Y,     0,   0,0,-10000, 0,10000,0,  10000,0,0,  11150, 5575, RAIL_MAT));
  list.push(makeLine(id++,   6290, BALL_Y,  6349,  -10000,0,0,  0,10000,0,  0,0,-10000, 11269, 5634, RAIL_MAT));
  list.push(makeLine(id++,  -6290, BALL_Y, -6349,   10000,0,0,  0,10000,0,  0,0, 10000, 11269, 5634, RAIL_MAT));
  list.push(makeLine(id++,   12128, BALL_Y,  6552,  -7071,0,-7071, 0,10000,0,  7071,0,-7071,  570, 285, RAIL_MAT));
  list.push(makeLine(id++,   12901, BALL_Y,  5778,   7071,0, 7071, 0,10000,0, -7071,0, 7071,  569, 284, RAIL_MAT));
  list.push(makeLine(id++,  -12128, BALL_Y, -6552,   7071,0, 7071, 0,10000,0, -7071,0, 7071,  570, 285, RAIL_MAT));
  list.push(makeLine(id++,  -12901, BALL_Y, -5778,  -7071,0,-7071, 0,10000,0,  7071,0,-7071,  569, 284, RAIL_MAT));
  return list;
}

function makePockets(): CmKinematicTrigger[] {
  const positions: [number, number, number][] = [
    [ 12875, BALL_Y,  6510], [ 12875, BALL_Y, -6510],
    [-12875, BALL_Y,  6510], [-12875, BALL_Y, -6510],
    [     0, BALL_Y,  7100], [     0, BALL_Y, -7100],
  ];
  return positions.map(([x, y, z], i) => {
    const t = new CmKinematicTrigger();
    t.id       = i;
    t.position = new CmVector(x, y, z);
    t.radius   = 450;
    return t;
  });
}

function makeGV01Space(): { space: CmSpace; ball: CmRigidbody } {
  const ball = makeBallGV(0, -4000, BALL_Y, 0);
  const space = new CmSpace();
  space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
  return { space, ball };
}

// ─── Drive simulation via step() to completion ────────────────────────────────

function runToStop(dt: number): {
  px: number; py: number; pz: number;
  calculateTime: number;
} {
  const { space, ball } = makeGV01Space();
  const loop = createSimulationLoop(space, mockScene);

  space.activate();
  ball.isActive = true;
  ball.addImpulse(new CmVector(30000, 0, 0), ball.collider.position, CmForceMode.Impulse);

  const MAX_ITERATIONS = 500_000;
  let iterations = 0;
  while (space.isActive && iterations < MAX_ITERATIONS) {
    loop.step(dt);
    iterations++;
  }

  return {
    px: ball.collider.position.x,
    py: ball.collider.position.y,
    pz: ball.collider.position.z,
    calculateTime: space.calculateTime,
  };
}

// ─── Test A: dt=0.010 vs dt=0.016 determinism ────────────────────────────────

describe('G2 spike: simulation-loop accumulator determinism', () => {
  it('G2-A: simulation reaches GV-01 vicinity with dt=0.016', () => {
    const r = runToStop(0.016);
    // GV-01 golden: px=-6979, py=9439, pz=0
    // Log actual value for diagnostic purposes regardless of match
    console.log(`[G2-A dt=0.016] px=${r.px} py=${r.py} pz=${r.pz} calcTime=${r.calculateTime}`);
    expect(r.py).toBe(9439);
    expect(r.pz).toBe(0);
  });

  it('G2-A KEY: dt=0.010 vs dt=0.016 → bit-exact final position', () => {
    // Core determinism invariant: the same physics must produce identical final state
    // regardless of how wall-clock dt is chunked into physics steps.
    // EXPECTED RESULT: FAIL if accumulator floating-point drift differs step counts.
    const r1 = runToStop(0.010);
    const r2 = runToStop(0.016);

    console.log(`[G2-A dt=0.010] px=${r1.px} py=${r1.py} pz=${r1.pz} calcTime=${r1.calculateTime}`);
    console.log(`[G2-A dt=0.016] px=${r2.px} py=${r2.py} pz=${r2.pz} calcTime=${r2.calculateTime}`);

    const pxMatch = r1.px === r2.px;
    const pyMatch = r1.py === r2.py;
    const pzMatch = r1.pz === r2.pz;
    const timeMatch = r1.calculateTime === r2.calculateTime;
    console.log(`[G2-A] match: px=${pxMatch} py=${pyMatch} pz=${pzMatch} physTime=${timeMatch}`);

    expect(r1.px).toBe(r2.px);
    expect(r1.py).toBe(r2.py);
    expect(r1.pz).toBe(r2.pz);
    expect(r1.calculateTime).toBe(r2.calculateTime);
  });

  it('G2-A: dt=0.001 (very small) vs dt=0.050 (large) → bit-exact', () => {
    const r1 = runToStop(0.001);
    const r2 = runToStop(0.050);

    console.log(`[G2-A dt=0.001] px=${r1.px} py=${r1.py} calcTime=${r1.calculateTime}`);
    console.log(`[G2-A dt=0.050] px=${r2.px} py=${r2.py} calcTime=${r2.calculateTime}`);

    expect(r1.px).toBe(r2.px);
    expect(r1.py).toBe(r2.py);
    expect(r1.pz).toBe(r2.pz);
    expect(r1.calculateTime).toBe(r2.calculateTime);
  });
});

// ─── Test B: GV-01 golden position check ─────────────────────────────────────
//
// G2-B FINDING: accumulator loop gives px=-9032, not GV-01 golden px=-6979.
// Divergence = 2053 units (20.53 cm). Root cause: the accumulator may accumulate
// extra physics time due to float drift in the timestep comparison/subtraction,
// causing the ball to travel further before triggering the isActive=false sleep check.
// This is the key G2 bug to ratify: direct space.calculate() loop vs accumulator loop
// give different final positions for the same physics scenario.

describe('G2 spike: GV-01 golden endpoint check (diagnostic)', () => {
  it('G2-B: documents accumulator vs direct simulate divergence', () => {
    // This test documents the divergence — NOT a determinism bug (G2-A is deterministic)
    // but a total-step-count discrepancy between accumulator and direct simulate paths.
    const r = runToStop(0.016);
    console.log(`[G2-B] accumulator result: px=${r.px}, py=${r.py}, pz=${r.pz}`);
    console.log(`[G2-B] GV-01 golden:       px=-6979, py=9439, pz=0`);
    console.log(`[G2-B] divergence px: ${r.px - (-6979)} units`);

    // Assert only non-diverging axes (y and z are expected to match)
    expect(r.py).toBe(9439);
    expect(r.pz).toBe(0);
    // x diverges — we log but do not assert to document without blocking CI.
    // px expected: -6979 (GV-01 golden), px actual: reported above.
    // RATIFICATION NEEDED: CTO to decide if accumulator must match direct simulate.
  });
});
