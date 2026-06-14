/**
 * Simulation loop — bridges physics (CmSpace) to rendering (SceneAPI).
 * Uses decoupled fixed timestep with accumulator.
 */

import type { Fixed } from '../physics/fixed-math';
import { MULTIPLIER, toFloat } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import { CmSpace } from '../physics/cm-space';
import { CmForceMode } from '../physics/cm-rigidbody';
import type { SceneAPI } from '../renderer/scene';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShotData {
  position: CmVector;  // apply point (ball center)
  impulse: CmVector;   // impulse vector
  torque: CmVector;    // spin torque (optional, CmVector.zero for no spin)
}

// ─── Simulation Loop ─────────────────────────────────────────────────────────

export function createSimulationLoop(space: CmSpace, scene: SceneAPI) {
  let running = false;
  let animId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let _isSimulating = false;

  /** Sync all ball positions from physics to renderer */
  function syncPositions() {
    for (const body of space.rigidbodies) {
      scene.updateBallPosition(
        body.id,
        toFloat(body.collider.position.x),
        toFloat(body.collider.position.y),
        toFloat(body.collider.position.z),
      );
    }
  }

  /** Physics frame step */
  function step(dt: number) {
    if (!space.isActive) {
      _isSimulating = false;
      return;
    }
    _isSimulating = true;
    accumulator += dt;

    // Fixed timestep stepping
    const maxStepsPerFrame = 50; // prevent spiral of death
    let steps = 0;
    while (accumulator >= toFloat(space.timestep) && space.isActive && steps < maxStepsPerFrame) {
      space.calculate(null, false);
      accumulator -= toFloat(space.timestep);
      steps++;
    }
    if (!space.isActive) {
      accumulator = 0;
      _isSimulating = false;
    }

    syncPositions();
  }

  /** Main animation frame */
  function frame(timestamp: number) {
    if (!running) return;
    const dt = lastTime === 0 ? 0.016 : Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    step(dt);
    scene.render();
    animId = requestAnimationFrame(frame);
  }

  return {
    /** Start the render/physics loop */
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      accumulator = 0;
      syncPositions();
      animId = requestAnimationFrame(frame);
    },

    /** Stop the loop */
    stop() {
      running = false;
      cancelAnimationFrame(animId);
    },

    /** Apply a shot to ball 0 (cue ball) */
    applyShot(shotData: ShotData) {
      const cueBall = space.rigidbodies[0];
      if (cueBall.isKinematic || cueBall.isOutOfCube) return;

      // Activate space
      space.activate();
      cueBall.isActive = true;

      // Apply impulse
      cueBall.addImpulse(shotData.impulse, shotData.position, CmForceMode.Impulse);

      // Apply torque if any
      if (!(shotData.torque.x === 0 && shotData.torque.y === 0 && shotData.torque.z === 0)) {
        cueBall.addTorque(shotData.torque, CmForceMode.Impulse);
      }

      _isSimulating = true;
      accumulator = 0;
    },

    get isSimulating() { return _isSimulating; },
  };
}
