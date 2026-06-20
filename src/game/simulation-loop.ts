/**
 * Simulation loop — bridges physics (CmSpace) to rendering (SceneAPI).
 *
 * Architecture: full-simulate-then-replay (G2 fix).
 *   applyShot() calls simulateToCompletion() from src/physics/simulate.ts — the SAME
 *   canonical loop used by golden-vector and fuzz-parity tests.  The production physics
 *   path is therefore identical to the golden path by code-level co-location.
 *
 *   The render rAF loop only paces replay animation via a float accumulator.
 *   The float accumulator never gates space.calculate() calls.
 */

import { toFloat } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import { CmSpace } from '../physics/cm-space';
import { CmForceMode } from '../physics/cm-rigidbody';
import type { SceneAPI } from '../renderer/scene';
import { MAX_FORCE } from '../physics/constants';
import { simulateToCompletion, type SimFrame } from '../physics/simulate';
export type { SimFrame } from '../physics/simulate';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShotData {
  position: CmVector;  // apply point (ball center or cue contact point)
  impulse: CmVector;   // impulse vector
  torque: CmVector;    // spin torque (CmVector.zero for no spin)
}

// ─── Simulation Loop ─────────────────────────────────────────────────────────

export function createSimulationLoop(space: CmSpace, scene: SceneAPI) {
  let running = false;
  let animId = 0;
  let lastTime = 0;

  // Replay state — populated by applyShot(), consumed by step()/frame()
  let frames: SimFrame[] = [];
  let frameIdx = 0;
  let replayAccumulator = 0;
  let _isSimulating = false;

  /** Sync all ball positions from current physics state to renderer. */
  function syncPositions(): void {
    for (const body of space.rigidbodies) {
      scene.updateBallPosition(
        body.id,
        toFloat(body.collider.position.x),
        toFloat(body.collider.position.y),
        toFloat(body.collider.position.z),
      );
    }
  }

  /** Push a single replay frame's positions to the renderer. */
  function syncFrame(idx: number): void {
    const frame = frames[idx];
    for (const p of frame.positions) {
      scene.updateBallPosition(p.id, toFloat(p.x), toFloat(p.y), toFloat(p.z));
    }
  }

  /**
   * Advance the replay by dt wall-clock seconds.
   * The float accumulator only paces animation — it never calls space.calculate().
   */
  function step(dt: number): void {
    if (frames.length === 0 || frameIdx >= frames.length) {
      _isSimulating = false;
      return;
    }
    _isSimulating = true;
    replayAccumulator += dt;

    while (frameIdx < frames.length && replayAccumulator >= toFloat(frames[frameIdx].timestep)) {
      replayAccumulator -= toFloat(frames[frameIdx].timestep);
      frameIdx++;
    }

    syncFrame(Math.min(frameIdx, frames.length - 1));

    if (frameIdx >= frames.length) {
      _isSimulating = false;
      replayAccumulator = 0;
    }
  }

  /** Main rAF callback — drives the replay loop. */
  function frame(timestamp: number): void {
    if (!running) return;
    const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    step(dt);
    scene.render();
    animId = requestAnimationFrame(frame);
  }

  return {
    /**
     * Advance replay by dt seconds — for animation pacing only, never calls space.calculate().
     * Exposed for tests; in production called by the rAF loop via frame().
     */
    step,

    /** Start the render/replay loop. */
    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      replayAccumulator = 0;
      syncPositions();
      animId = requestAnimationFrame(frame);
    },

    /** Stop the render/replay loop. */
    stop(): void {
      running = false;
      cancelAnimationFrame(animId);
    },

    /**
     * Apply a shot to ball 0 (cue ball).
     * Ingress-validates the impulse, then calls simulateToCompletion() — the canonical
     * integer loop shared with golden-vector and fuzz-parity tests.  Physics completes
     * synchronously before this method returns; replay begins on the next step() call.
     */
    applyShot(shotData: ShotData): void {
      const cueBall = space.rigidbodies[0];
      if (cueBall.isKinematic || cueBall.isOutOfCube) return;

      // Ingress validation: clamp impulse magnitude to MAX_FORCE (PHY-003).
      // Prevents C# long overflow (> 2^63) and JS Number precision loss (> 2^53).
      const imp = shotData.impulse;
      const mag2 = imp.x * imp.x + imp.y * imp.y + imp.z * imp.z;
      const maxMag2 = MAX_FORCE * MAX_FORCE;
      const safeImpulse = mag2 > maxMag2
        ? new CmVector(
            Math.trunc(imp.x * MAX_FORCE / Math.sqrt(mag2)),
            Math.trunc(imp.y * MAX_FORCE / Math.sqrt(mag2)),
            Math.trunc(imp.z * MAX_FORCE / Math.sqrt(mag2)),
          )
        : imp;

      space.activate();
      cueBall.isActive = true;
      cueBall.addImpulse(safeImpulse, shotData.position, CmForceMode.Impulse);

      if (!(shotData.torque.x === 0 && shotData.torque.y === 0 && shotData.torque.z === 0)) {
        cueBall.addTorque(shotData.torque, CmForceMode.Impulse);
      }

      // Canonical simulation — same function as golden-vector / fuzz-parity tests
      frames = simulateToCompletion(space);
      frameIdx = 0;
      replayAccumulator = 0;
      _isSimulating = frames.length > 0;
    },

    /** True while replay animation is in progress. */
    get isSimulating(): boolean { return _isSimulating; },

    /** Recorded trajectory from the most recent shot (read-only, for testing / replay seek). */
    get shotFrames(): readonly SimFrame[] { return frames; },
  };
}
