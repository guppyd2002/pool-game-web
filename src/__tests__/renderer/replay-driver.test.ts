/**
 * GAME-011/012 — replay-driver ball-hide tests.
 * Uses fake requestAnimationFrame to drive ticks synchronously.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReplayDriver } from '../../renderer/replay-driver';
import type { IBallPoolPhysics, BallState, AimHit, PhysicsConstants, ShotData, ShotResult } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { SimFrame } from '../../physics/simulate';
import * as THREE from 'three';

// ─── Minimal mock helpers ────────────────────────────────────────────────────

function makeMesh(): THREE.Mesh {
  const m = new THREE.Mesh();
  m.visible = true;
  return m;
}

function makeScene(count = 16): SceneAPI {
  const balls: THREE.Mesh[] = Array.from({ length: count }, makeMesh);
  return {
    balls,
    camera: null as unknown as THREE.PerspectiveCamera,
    renderer: null as unknown as THREE.WebGLRenderer,
    scene: null as unknown as THREE.Scene,
    table: null as unknown as THREE.Group,
    updateBallPosition: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function makeFrame(timestep: number): SimFrame {
  return { timestep, positions: [] };
}

function makePhysics(frames: SimFrame[], simulating: boolean): IBallPoolPhysics {
  let _simulating = simulating;
  return {
    applyShot: vi.fn() as unknown as (s: ShotData) => ShotResult,
    shotFrames: frames,
    getBall: vi.fn() as unknown as (id: number) => BallState,
    getActiveBalls: vi.fn() as unknown as () => BallState[],
    allBalls: [],
    predictAimLine: vi.fn() as unknown as (from: unknown, dir: unknown) => AimHit,
    step: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    get isSimulating() { return _simulating; },
    getStateAsString: vi.fn() as unknown as () => string,
    setStateFromString: vi.fn(),
    resetToStartState: vi.fn(),
    getPhysicsConstants: vi.fn() as unknown as () => PhysicsConstants,
    placeBall: vi.fn(),
    respotCueBall: vi.fn(),
    setSimulating(v: boolean) { _simulating = v; },
  } as unknown as IBallPoolPhysics & { setSimulating(v: boolean): void };
}

// ─── Fake rAF ───────────────────────────────────────────────────────────────

let _rafCallbacks: Array<(ts: number) => void> = [];
let _rafTime = 0;

function installFakeRaf(): void {
  _rafCallbacks = [];
  _rafTime = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (ts: number) => void) => {
    _rafCallbacks.push(cb);
    return _rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    _rafCallbacks = [];
  });
}

function tickRaf(dtMs: number): void {
  _rafTime += dtMs;
  const cbs = [..._rafCallbacks];
  _rafCallbacks = [];
  for (const cb of cbs) cb(_rafTime);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('replay-driver — GAME-011/012', () => {
  beforeEach(() => { installFakeRaf(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('calls cb when physics.isSimulating becomes false', () => {
    const driver = createReplayDriver();
    const physics = makePhysics([makeFrame(10000)], true) as unknown as IBallPoolPhysics & { setSimulating(v: boolean): void };
    const scene = makeScene();
    const cb = vi.fn();

    driver.watch(physics, scene, [], [], cb);

    // First tick — still simulating
    tickRaf(16);
    expect(cb).not.toHaveBeenCalled();

    // Make simulating end, next tick fires cb
    (physics as unknown as { setSimulating(v: boolean): void }).setSimulating(false);
    tickRaf(16);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('hides pocketed ball mesh at correct wall-clock time', () => {
    // Frames: 3 frames of 100ms each (timestep in fixed = 10000 = 1.0s per unit)
    // Using toFloat: timestep 1000 → 0.1s
    const frames = [makeFrame(1000), makeFrame(1000), makeFrame(1000)];
    const driver = createReplayDriver();
    const physics = makePhysics(frames, true) as unknown as IBallPoolPhysics & { setSimulating(v: boolean): void };
    const scene = makeScene();
    const cb = vi.fn();

    // Ball 3 pocketed at stepIndex=1 → cumTime after frame 1 = 0.1s
    driver.watch(physics, scene, [{ ballId: 3, stepIndex: 1 }], [], cb);

    // First tick: dt=0 (lastTs===0 guard), elapsed=0; ball still visible
    tickRaf(50);
    expect(scene.balls[3].visible).toBe(true);

    // Second tick: dt=0.05s, elapsed=0.05 < 0.1 → still visible
    tickRaf(50);
    expect(scene.balls[3].visible).toBe(true);

    // Third tick: dt=0.05s, elapsed=0.10 >= 0.10 → hidden
    tickRaf(50);
    expect(scene.balls[3].visible).toBe(false);

    // Other balls untouched
    expect(scene.balls[1].visible).toBe(true);
  });

  it('hides out-of-table balls when replay ends', () => {
    const driver = createReplayDriver();
    const physics = makePhysics([makeFrame(1000)], true) as unknown as IBallPoolPhysics & { setSimulating(v: boolean): void };
    const scene = makeScene();
    const cb = vi.fn();

    driver.watch(physics, scene, [], [{ ballId: 5 }], cb);

    tickRaf(16);
    expect(scene.balls[5].visible).toBe(true);  // not yet

    (physics as unknown as { setSimulating(v: boolean): void }).setSimulating(false);
    tickRaf(16);
    expect(scene.balls[5].visible).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('resetVisibility restores all balls to visible', () => {
    const driver = createReplayDriver();
    const scene = makeScene(4);
    scene.balls[0].visible = false;
    scene.balls[2].visible = false;

    driver.resetVisibility(scene, 4);

    for (const mesh of scene.balls) {
      expect(mesh.visible).toBe(true);
    }
  });

  it('does not fire cb if already simulating=false on first tick', () => {
    const driver = createReplayDriver();
    const physics = makePhysics([], false);  // never simulating
    const scene = makeScene();
    const cb = vi.fn();

    driver.watch(physics, scene, [], [], cb);
    tickRaf(16);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
