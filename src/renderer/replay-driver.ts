/**
 * GAME-011/012 — replay-driven ball visibility.
 * Renderer-layer only: operates on THREE.Mesh visibility and IBallPoolPhysics.isSimulating.
 * Does NOT read frameIdx (C3-I2 compliant — only polls the boolean isSimulating).
 *
 * GAME-012 D-1 approach (per spec):
 *   canonical sim already recorded ball trajectories in ShotResult.frames.
 *   Physics latch isKinematic at the step the ball entered the pocket trigger.
 *   During replay, ball positions play back naturally up to that step.
 *   We hide the mesh when replay wall-clock reaches the cumulative time at stepIndex.
 *   "Ball rolls to pocket → disappears" — no second simulation path needed.
 *
 * C3-I2 contract: we only read physics.isSimulating (boolean) and physics.shotFrames
 * (read-only frame data from the completed simulation). Neither exposes frameIdx.
 */

import type { IBallPoolPhysics } from '../game/ball-pool-physics';
import type { SceneAPI } from './scene';
import { toFloat } from '../physics/fixed-math';

export interface ReplayDriver {
  /**
   * Start watching a replay. Computes hide-times from shotFrames + pocketed stepIndices.
   * Fires cb when physics.isSimulating becomes false (replay done).
   * Multiple watch() calls cancel the previous watch.
   */
  watch(
    physics: IBallPoolPhysics,
    scene: SceneAPI,
    pocketed: ReadonlyArray<{ ballId: number; stepIndex: number }>,
    outOfTable: ReadonlyArray<{ ballId: number }>,
    cb: () => void,
  ): void;

  /** Restore all ball meshes to visible (call on new game / reset). */
  resetVisibility(scene: SceneAPI, ballCount: number): void;

  dispose(): void;
}

export function createReplayDriver(): ReplayDriver {
  let _rafId = 0;
  let _active = false;

  return {
    watch(physics, scene, pocketed, outOfTable, cb) {
      cancelAnimationFrame(_rafId);
      _active = true;

      // Build hide-time map: cumulative wall-clock time (in seconds) at each stepIndex.
      // shotFrames is read-only data from the completed simulation — C3-I2 safe.
      const shotFrames = physics.shotFrames;
      let cumTime = 0;
      const cumTimes: number[] = [0];  // cumTimes[i] = time to REACH frame i
      for (let i = 0; i < shotFrames.length; i++) {
        cumTime += toFloat(shotFrames[i].timestep);
        cumTimes.push(cumTime);
      }

      const pocketedAt = new Map<number, number>();  // ballId → wall-clock hide time
      for (const p of pocketed) {
        const hideTime = cumTimes[Math.min(p.stepIndex, cumTimes.length - 1)] ?? cumTime;
        pocketedAt.set(p.ballId, hideTime);
      }

      let elapsed = 0;
      let lastTs = 0;

      function tick(ts: number): void {
        if (!_active) return;
        const dt = lastTs === 0 ? 0 : Math.min((ts - lastTs) / 1000, 0.1);
        lastTs = ts;
        elapsed += dt;

        // Hide pocketed balls when replay clock reaches their stepIndex time
        for (const [ballId, hideTime] of pocketedAt) {
          if (elapsed >= hideTime) {
            const mesh = scene.balls[ballId];
            if (mesh?.visible) mesh.visible = false;
          }
        }

        if (!physics.isSimulating) {
          _active = false;
          // Also hide out-of-table balls (they've left the play area)
          for (const oot of outOfTable) {
            const mesh = scene.balls[oot.ballId];
            if (mesh) mesh.visible = false;
          }
          cb();
          return;
        }

        _rafId = requestAnimationFrame(tick);
      }

      _rafId = requestAnimationFrame(tick);
    },

    resetVisibility(scene, ballCount) {
      for (let i = 0; i < ballCount; i++) {
        const mesh = scene.balls[i];
        if (mesh) mesh.visible = true;
      }
    },

    dispose() {
      _active = false;
      cancelAnimationFrame(_rafId);
    },
  };
}
