/**
 * G6 🟡-B adversarial: pocketed/outOfTable.stepIndex must be the TRUE step
 * number, not the silently-zeroed ?? 0 fallback from the old timeToStep map.
 *
 * Old root cause: cumTimes used T_{N-1} sequence; ev.time used actual T_N
 * values → timeToStep.get() miss → ?? 0 even for step-300 events.
 *
 * Fix (14948ee): detect isKinematic/isOutOfCube false→true edges directly
 * in the onStep callback where stepIndex is the exact loop counter.
 *
 * Three tests:
 *   A) pocketed.stepIndex > 0 for mid-shot pocketing
 *   B) outOfTable.stepIndex > 0 for mid-shot OOT
 *   C) bijection: frames[claimedStep] position is actually inside the pocket zone
 */

import { describe, it, expect } from 'vitest';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider } from '../../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { CmSpaceCube } from '../../physics/cm-collision';
import {
  BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL as BALL_MAT,
  CLOTH_MATERIAL as CLOTH_MAT,
  POCKET_RADIUS, POCKET_POSITIONS,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  PLANE_SCALE_X, PLANE_RADIUS,
} from '../../physics/constants';

// Minimal renderer stub — applyShot() never calls render methods (only start()/step() do)
const NULL_RENDERER = {
  updateBallPosition: () => {},
  render: () => {},
} as unknown as SceneAPI;

const SPACE_CUBE: CmSpaceCube = {
  position: CmVector.zero,
  scale: new CmVector(SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z),
};

function makeBall(id: number, x: number, z: number): CmRigidbody {
  const col = new CmSphereCollider();
  col.id       = id;
  col.position = new CmVector(x, BALL_Y, z);
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
  body.centreOfMass = CmVector.zero;
  body.init();
  return body;
}

function makePlane(): CmPlaneCollider {
  const p = new CmPlaneCollider();
  p.id       = 0;
  p.position = new CmVector(0, TABLE_Y, 0);
  p.right    = new CmVector(10000, 0, 0);
  p.up       = new CmVector(0, 10000, 0);
  p.forward  = new CmVector(0, 0, 10000);
  p.scale    = new CmVector(PLANE_SCALE_X, 5000, PLANE_RADIUS);
  p.radius   = PLANE_RADIUS;
  p.enabled  = true;
  p.material = { ...CLOTH_MAT };
  return p;
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

// Pocket 4: [0, 7100] — center +z (middle of far short rail).
// Trigger fires when 3D distance < POCKET_RADIUS + BALL_RADIUS = 735 → z > 6365.
// Ball at z=5000 must travel > 1365 units before entering.
// At velocity 117647 and MIN_TS=50: ~588 units/step → enters at step ~2–3.
// Old ?? 0 fallback returns 0 for any step > 0 → test catches regression.
const POCKET4_Z = 7100;
const BALL_START_Z = 5000;

describe('G6 🟡-B: pocketed/outOfTable.stepIndex — true step, not ?? 0', () => {

  it('A) pocketed.stepIndex > 0 for ball that pockets mid-shot (not on first step)', () => {
    const ball = makeBall(0, 0, BALL_START_Z);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], [makePlane()], makePockets());
    const physics = createBallPoolPhysics(space, NULL_RENDERER);

    const result = physics.applyShot({
      position: new CmVector(0, BALL_Y, BALL_START_Z),
      impulse:  new CmVector(0, 0, 30000), // +z toward pocket 4
      torque:   CmVector.zero,
    });

    // Precondition: ball actually pocketed (catches bad test setup early)
    expect(result.pocketed.length).toBeGreaterThan(0);

    // KEY ASSERTION: old ?? 0 fallback would give 0 here even for step-N events
    expect(result.pocketed[0].stepIndex).toBeGreaterThan(0);

    // Sanity: stepIndex must be within simulation duration
    expect(result.pocketed[0].stepIndex).toBeLessThan(result.frames.length);
  });

  it('B) outOfTable.stepIndex > 0 for ball launched past cube boundary mid-shot', () => {
    // Ball at x=10000, strong +x impulse → exits cube (halfX=15000) after multiple steps.
    const ball = makeBall(0, 10000, 0);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], [makePlane()], []);
    const physics = createBallPoolPhysics(space, NULL_RENDERER);

    const result = physics.applyShot({
      position: new CmVector(10000, BALL_Y, 0),
      impulse:  new CmVector(65000, 0, 0), // MAX_FORCE in +x
      torque:   CmVector.zero,
    });

    // Precondition: ball actually exited (catches bad test setup early)
    expect(result.outOfTable.length).toBeGreaterThan(0);

    // KEY ASSERTION: old ?? 0 fallback would give 0 here
    expect(result.outOfTable[0].stepIndex).toBeGreaterThan(0);

    expect(result.outOfTable[0].stepIndex).toBeLessThan(result.frames.length);
  });

  it('C) bijection: frames[pocketed.stepIndex] shows ball inside pocket trigger zone', () => {
    // Independent cross-check: the claimed stepIndex must correspond to a frame where
    // the ball centre is within POCKET_RADIUS of the pocket trigger centre.
    // Old bug (stepIndex=0) would point to the wrong frame (ball far from pocket).
    const ball = makeBall(0, 0, BALL_START_Z);
    const space = new CmSpace();
    space.init(SPACE_CUBE, [ball], [makePlane()], makePockets());
    const physics = createBallPoolPhysics(space, NULL_RENDERER);

    const result = physics.applyShot({
      position: new CmVector(0, BALL_Y, BALL_START_Z),
      impulse:  new CmVector(0, 0, 30000),
      torque:   CmVector.zero,
    });

    if (result.pocketed.length === 0) {
      // Ball didn't pocket → test is void (setup invalid, not a fix regression)
      return;
    }

    const claimedStep = result.pocketed[0].stepIndex;
    const framePos = result.frames[claimedStep].positions.find(p => p.id === 0);
    expect(framePos).toBeDefined();

    if (framePos) {
      // 2D distance (x,z) from ball to pocket 4 at (0, POCKET4_Z)
      const dx = framePos.x - 0;
      const dz = framePos.z - POCKET4_Z;
      // Ball must be within POCKET_RADIUS + some tolerance of the pocket trigger
      // (trigger fires when 3D distance < POCKET_RADIUS; here x≈0 and y≈BALL_Y)
      const dist2d = Math.sqrt(dx * dx + dz * dz);
      expect(dist2d).toBeLessThanOrEqual(POCKET_RADIUS + BALL_RADIUS);
    }
  });
});
