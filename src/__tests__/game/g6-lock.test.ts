/**
 * G6 lock gate tests — two conditions 千手 requires before G6 is locked.
 *
 * (A) onStep-neutrality guard:
 *     simulateToCompletion with a read-only onStep observer must produce
 *     bit-exact identical frames and final positions as without onStep.
 *     Without this guard, a future onStep side-effect would silently diverge
 *     from the golden/fuzz canonical path.
 *
 * (B) pocketed / outOfTable.stepIndex = true step number (not silently 0):
 *     Root cause fixed in ball-pool-physics.ts: the old time→step reconstruction
 *     used frames[i].timestep = T_{i-1} (physDt snapshot is the PREVIOUS step's
 *     adaptive value), so cumTimes drifted and timeToStep.get() returned
 *     undefined → ?? 0, silently zeroing all mid-shot pocket stepIndices.
 *     Fix: detect isKinematic/isOutOfCube transitions directly in onStep.
 */
import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../../physics/colliders';
import type { CmMaterial } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import type { CmSpaceCube } from '../../physics/cm-collision';
import { simulateToCompletion, MAX_SIM_STEPS } from '../../physics/simulate';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
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
} from '../../physics/constants';

// ─── Scene helpers (mirror golden-vector.test.ts) ─────────────────────────────

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBall(id: number, x: number, y: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id = id;
  col.position = new CmVector(x, y, z);
  col.right    = new CmVector(10000, 0, 0);
  col.up       = new CmVector(0, 10000, 0);
  col.forward  = new CmVector(0, 0, 10000);
  col.scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  col.radius   = BALL_RADIUS;
  col.enabled  = true;
  col.material = { ...BALL_MAT };
  const body = new CmRigidbody();
  body.id   = id;
  body.mass = BALL_MASS;
  body.collider = col;
  body.init();
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

  list.push(makeLine(id++,  RAIL_LONG_X, BALL_Y, 0,    0,0,10000,  0,10000,0, -10000,0,0, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_LONG_X, BALL_Y, 0,    0,0,-10000, 0,10000,0, 10000,0,0,  RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  RAIL_BACK_X, BALL_Y,  RAIL_BACK_Z, -10000,0,0, 0,10000,0, 0,0,-10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -RAIL_BACK_X, BALL_Y, -RAIL_BACK_Z,  10000,0,0, 0,10000,0, 0,0, 10000, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_A_X, BALL_Y,  CORNER_A_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++,  CORNER_B_X, BALL_Y,  CORNER_B_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_A_X, BALL_Y, -CORNER_A_Z,   DIAG_UNIT,0, DIAG_UNIT, 0,10000,0, -DIAG_UNIT,0, DIAG_UNIT, CORNER_A_SCALE_X, CORNER_A_RADIUS, RAIL_MAT));
  list.push(makeLine(id++, -CORNER_B_X, BALL_Y, -CORNER_B_Z,  -DIAG_UNIT,0,-DIAG_UNIT, 0,10000,0,  DIAG_UNIT,0,-DIAG_UNIT, CORNER_B_SCALE_X, CORNER_B_RADIUS, RAIL_MAT));
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

// ─── (A) onStep-neutrality guard ─────────────────────────────────────────────

describe('G6-lock (A): simulateToCompletion onStep-neutrality', () => {
  /**
   * Passing a read-only onStep observer must NOT alter frames or final positions.
   * Verifies the C1 "pure observer" contract in simulate.ts.
   * Without this guard, a future onStep side-effect silently diverges from golden.
   *
   * Uses GV-01 scenario (single ball, canonical shot) as representative input.
   */
  it('frames.length and final ball positions are bit-exact with or without onStep', () => {
    function run(withOnStep: boolean): { frameCount: number; px: number; py: number; pz: number } {
      const ball = makeBall(0, -5000, BALL_Y, 0);
      const space = new CmSpace();
      space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
      ball.velocity = new CmVector(30000, 0, 0);
      space.isActive = true;

      const frames = withOnStep
        ? simulateToCompletion(space, MAX_SIM_STEPS, (sp, _idx) => {
            // read-only: iterate bodies without writing anything
            let _sum = 0;
            for (const b of sp.rigidbodies) _sum += b.collider.position.x;
          })
        : simulateToCompletion(space, MAX_SIM_STEPS);

      return {
        frameCount: frames.length,
        px: ball.collider.position.x,
        py: ball.collider.position.y,
        pz: ball.collider.position.z,
      };
    }

    const noStep   = run(false);
    const withStep = run(true);

    expect(withStep.frameCount).toBe(noStep.frameCount);
    expect(withStep.px).toBe(noStep.px);
    expect(withStep.py).toBe(noStep.py);
    expect(withStep.pz).toBe(noStep.pz);
  });
});

// ─── (B) pocketed / outOfTable stepIndex = true step (not silently 0) ─────────

describe('G6-lock (B): pocketed.stepIndex is true step number (not ?? 0)', () => {
  /**
   * Ball pocketed at step > 0: the old time→step reconstruction silently returned 0
   * (timeToStep.get(ev.time) === undefined → ?? 0) because frames[i].timestep = T_{i-1}.
   * The fix: detect isKinematic/isOutOfCube transitions directly in onStep, where
   * stepIndex is the canonical loop counter.
   *
   * Scenario: ball at (11111, BALL_Y, 6510) shot toward corner pocket at (12875, BALL_Y, 6510).
   * At MIN_TS=50 and vel≈176470, the ball travels ≈882 units/step:
   *   step 0: x≈11993 — not yet in trigger range (sqrDist > 54)
   *   step 1+: x≈12875 — inside trigger (sqrDist ≤ 54)
   * Pocket happens at step > 0 → stepIndex must be > 0 after fix.
   */
  it('ball pocketed mid-shot → pocketed[0].stepIndex > 0 (true step, not silent 0)', () => {
    const ball = makeBall(0, 11111, BALL_Y, 6510);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const result = physics.applyShot({
      impulse:  new CmVector(30000, 0, 0), // drives ball toward corner pocket at (12875, 6510)
      position: new CmVector(11111, BALL_Y, 6510),
      torque:   CmVector.zero,
    });

    // Ball must actually reach the pocket
    expect(result.pocketed.length).toBeGreaterThan(0);
    // stepIndex must be the true step number, not the silent 0 from the ?? 0 bug
    expect(result.pocketed[0].stepIndex).toBeGreaterThan(0);
  });

  /**
   * outOfTable.stepIndex same guarantee: ball launched off-table mid-shot must report
   * a true step number (not 0) for the OOT event.
   *
   * Scenario: ball at (14000, BALL_Y, 0) with strong +x impulse exits cube on step 1+.
   * Step 0: ball moves ≈882 units to ~14882, still inside (halfX=15000).
   *   overflow = fixClampMin(14882 - 15000, 0) = 0 → inside.
   * Step 1+: ball moves further, overflow > BALL_RADIUS threshold → OOT.
   */
  it('ball out-of-table mid-shot → outOfTable[0].stepIndex > 0 (true step, not silent 0)', () => {
    const ball = makeBall(0, 14000, BALL_Y, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], makeTable(), makePockets());
    const physics = createBallPoolPhysics(space, mockScene);

    const result = physics.applyShot({
      impulse:  new CmVector(30000, 0, 0), // exits cube in a few steps
      position: new CmVector(14000, BALL_Y, 0),
      torque:   CmVector.zero,
    });

    expect(result.outOfTable.length).toBeGreaterThan(0);
    expect(result.outOfTable[0].stepIndex).toBeGreaterThan(0);
  });
});
