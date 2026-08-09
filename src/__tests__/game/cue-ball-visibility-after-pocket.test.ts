/**
 * Pin: after cue pocketed (mesh hidden), placeBall must restore visible
 * for the rest of the game — not only on new-game reset.
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
  it('scratch hide → placeBall → still visible on later placeBall', () => {
    const { scene, cueMesh } = makeSceneWithCueMesh();
    const physics = createBallPoolPhysics(createPoolTable(), scene);
    cueMesh.visible = false;
    physics.placeBall(0, new CmVector(0, BALL_Y, 0));
    expect(cueMesh.visible).toBe(true);
    physics.placeBall(0, new CmVector(1000, BALL_Y, 500));
    expect(cueMesh.visible).toBe(true);
    physics.respotCueBall();
    expect(cueMesh.visible).toBe(true);
  });

  it('BIH commit after hide restores visible', () => {
    const { scene, cueMesh } = makeSceneWithCueMesh();
    const physics = createBallPoolPhysics(createPoolTable(), scene);
    const bih = createBallInHandController(physics, 0);
    cueMesh.visible = false;
    bih.enter();
    bih.move(0, 0);
    expect(bih.commit()).toBe(true);
    expect(cueMesh.visible).toBe(true);
  });
});
