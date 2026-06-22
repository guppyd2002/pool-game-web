/**
 * Integration smoke test — verifies full wiring from table setup through shot application.
 *
 * Does NOT test Three.js rendering (no DOM/WebGL in Node.js).
 * Tests the complete physics + controller domain stack:
 *   createPoolTable → createBallPoolPhysics → createCueController → shot fires → replay frames
 */
import { describe, it, expect } from 'vitest';
import { createPoolTable } from '../../game/table-setup';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import { createCueController } from '../../game/cue-controller';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import type { BallState, ShotResult } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';

// ─── Minimal SceneAPI stub (no Three.js DOM/WebGL needed) ────────────────────

const sceneStub: SceneAPI = {
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

// ─── Smoke tests ─────────────────────────────────────────────────────────────

describe('Integration smoke — full physics stack', () => {
  it('createPoolTable() creates a valid CmSpace with 16 balls', () => {
    const space = createPoolTable();
    expect(space.rigidbodies.length).toBe(16);  // 1 cue + 15 object balls
  });

  it('createBallPoolPhysics() initialises without error', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    expect(physics).toBeDefined();
    expect(physics.isSimulating).toBe(false);
  });

  it('getBall(0) returns cue ball at correct Fixed Y position', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cueBall = physics.getBall(0);
    expect(cueBall.position.y).toBeGreaterThan(0);  // above table surface
  });

  it('allBalls returns 16 balls', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    expect(physics.allBalls.length).toBe(16);
  });

  it('createCueController fires a shot and changes physics state', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cue = createCueController(physics);

    const cueBall = physics.getBall(0);
    const cx = cueBall.position.x / MULTIPLIER;
    const cz = cueBall.position.z / MULTIPLIER;

    // Aim toward +X direction: start = cue ball pos, current = 1m in +X
    cue.onDragStart({ x: cx, z: cz });
    cue.onDragMove({ x: cx + 1.5, z: cz });  // 1.5m drag = max force
    const fired = cue.onDragEnd({ x: cx + 1.5, z: cz });

    expect(fired).toBe(true);
  });

  it('applyShot directly produces a non-empty ShotResult', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cueBall = physics.getBall(0);

    const result: ShotResult = physics.applyShot({
      position: cueBall.position,
      impulse: new CmVector(Math.trunc(30000 * MULTIPLIER / 100), 0, 0),  // moderate force
      torque: CmVector.zero,
    });

    // Shot must produce at least some simulation frames
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.finalStates.length).toBe(16);
  });

  it('after applyShot, cue ball final state has moved in X', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cueBall = physics.getBall(0);
    const startX = cueBall.position.x;

    const result: ShotResult = physics.applyShot({
      position: cueBall.position,
      impulse: new CmVector(Math.trunc(30000), 0, 0),  // impulse in +X direction
      torque: CmVector.zero,
    });

    const cueFinalState: BallState | undefined = result.finalStates.find(s => s.id === 0);
    expect(cueFinalState).toBeDefined();
    // Ball must have moved from starting position
    expect(cueFinalState!.position.x).not.toBe(startX);
  });

  it('predictAimLine returns a non-none hit for a clear shot toward rack', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cueBall = physics.getBall(0);

    // Aim from cue ball toward +X (toward the rack)
    const hit = physics.predictAimLine(
      cueBall.position,
      new CmVector(MULTIPLIER, 0, 0),  // unit vector in +X
    );

    expect(hit.hitType).not.toBe('none');  // must hit something (ball or cushion)
  });

  it('getStateAsString / setStateFromString round-trip preserves ball count', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);

    const stateStr = physics.getStateAsString();
    expect(typeof stateStr).toBe('string');
    expect(stateStr.length).toBeGreaterThan(0);

    // Apply a shot to change state
    const cueBall = physics.getBall(0);
    physics.applyShot({
      position: cueBall.position,
      impulse: new CmVector(30000, 0, 0),
      torque: CmVector.zero,
    });

    // Restore state
    physics.setStateFromString(stateStr);
    expect(physics.allBalls.length).toBe(16);
  });

  it('CueController.fireNow fires using last aim state (CUE-002)', () => {
    const space = createPoolTable();
    const physics = createBallPoolPhysics(space, sceneStub);
    const cue = createCueController(physics);

    const cueBall = physics.getBall(0);
    const cx = cueBall.position.x / MULTIPLIER;
    const cz = cueBall.position.z / MULTIPLIER;

    // Set aim but don't fire via drag
    cue.onDragStart({ x: cx, z: cz });
    cue.onDragMove({ x: cx + 1.0, z: cz });

    // Fire via slider power (CUE-002 path)
    const fired = cue.fireNow(0.5);
    expect(fired).toBe(true);
  });
});
