/**
 * Pin: after cue is pocketed (mesh hidden), returning it to play must keep it
 * visible for the rest of the game — not only on new-game reset.
 *
 * Prediction (CEO / code audit @11638b7): hideBall leaves visible=false forever;
 * only _placeRack / resetVisibility restored it. placeBall now restores in-play.
 *
 * Assert: hide → place → subsequent placeBall / respot / position updates → still visible.
 */
import { describe, it, expect } from 'vitest';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import { createPoolTable } from '../../game/table-setup';
import { CmVector } from '../../physics/cm-vector';
import { BALL_Y } from '../../physics/constants';
import { createBallInHandController } from '../../game/ball-in-hand';

function makeSceneWithCueMesh(): {
  scene: SceneAPI;
  cueMesh: { visible: boolean };
} {
  const cueMesh = { visible: true };
  const balls = Array.from({ length: 16 }, () => ({ visible: true }));
  balls[0] = cueMesh;
  const scene = {
    updateBallPosition: () => {},
    render: () => {},
    dispose: () => {},
    renderer: null as unknown as import('three').WebGLRenderer,
    camera: null as unknown as import('three').PerspectiveCamera,
    scene: null as unknown as import('three').Scene,
    balls: balls as unknown as import('three').Mesh[],
    table: null as unknown as import('three').Group,
    activeCamera: null as unknown as import('three').Camera,
    setOrthoTop: () => {},
  } as SceneAPI;
  return { scene, cueMesh };
}

describe('cue ball visibility after pocket (in-play ⇒ visible)', () => {
  it('scratch hide → placeBall → still visible on later placeBall (whole-game pin)', () => {
    const { scene, cueMesh } = makeSceneWithCueMesh();
    const physics = createBallPoolPhysics(createPoolTable(), scene);

    // Replay path: pocketed cue → hideBall / mesh.visible = false
    cueMesh.visible = false;

    // BIH commit path: placeBall returns cue to table
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(cueMesh.visible).toBe(true);

    // "Later shots" do not re-hide without a new pocket; re-place / respot must stay visible
    physics.placeBall(0, new CmVector(1000, BALL_Y, 500));
    expect(cueMesh.visible).toBe(true);

    physics.respotCueBall();
    expect(cueMesh.visible).toBe(true);
  });

  it('BIH controller commit after simulated hide restores visible (full placement path)', () => {
    const { scene, cueMesh } = makeSceneWithCueMesh();
    const physics = createBallPoolPhysics(createPoolTable(), scene);
    const bih = createBallInHandController(physics, 0);

    cueMesh.visible = false; // post-pocket
    bih.enter();
    // free table centre
    bih.move(0, 0);
    expect(bih.proposedIsFree).toBe(true);
    expect(bih.commit()).toBe(true);
    expect(cueMesh.visible).toBe(true);

    // After placement, another place must not leave ball hidden
    cueMesh.visible = false; // would be the old bug if placeBall forgot restore again
    physics.placeBall(0, new CmVector(-2000, BALL_Y, 0));
    expect(cueMesh.visible).toBe(true);
  });
});
