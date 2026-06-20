/**
 * Canonical physics runner — single source of truth for simulation.
 *
 * Both the production render path (simulation-loop.ts → applyShot) and all test
 * harnesses (golden-vector.test.ts, fuzz-parity.test.ts) call simulateToCompletion()
 * from this module.  Code-level co-location guarantees "production path == golden path"
 * without relying on human-audited loop equivalence.
 *
 * Invariants:
 *   • space.timestep is snapshotted BEFORE space.calculate() so each frame records the
 *     timestep that was actually consumed (not the post-adaptive value).
 *   • All stored values are Fixed integers — no floats enter SimFrame.
 *   • The safety cap MAX_SIM_STEPS matches the fuzz-parity and golden-vector harnesses.
 */

import type { Fixed } from './fixed-math';
import type { CmSpace } from './cm-space';
import { MAX_SIM_STEPS } from './constants';

// Re-export so callers that import MAX_SIM_STEPS from here still work.
export { MAX_SIM_STEPS } from './constants';

/**
 * One recorded physics step.
 * timestep: the adaptive Fixed timestep that was in effect when space.calculate() ran.
 * positions: ball positions after that step — Fixed integers, no floats.
 */
export interface SimFrame {
  readonly timestep: Fixed;
  readonly positions: ReadonlyArray<{
    readonly id: number;
    readonly x: Fixed;
    readonly y: Fixed;
    readonly z: Fixed;
  }>;
}

/**
 * Run a CmSpace to rest using the canonical integer loop.
 *
 * Equivalent to: while (space.isActive && steps < maxSteps) { space.calculate(null, false); }
 * but also records every step as a SimFrame for animation replay.
 *
 * The float render-accumulator in simulation-loop.ts never reaches this function.
 *
 * onStep (optional, C1-observer exception): called after each calculate(), before
 * hitBodies/hitColliders are cleared by the next step. Read-only — must not mutate space.
 * Golden/fuzz/G2 callers do NOT pass onStep → no-callback path is byte-identical.
 */
export function simulateToCompletion(
  space: CmSpace,
  maxSteps = MAX_SIM_STEPS,
  onStep?: (space: CmSpace, stepIndex: number) => void,
): SimFrame[] {
  const frames: SimFrame[] = [];
  let steps = 0;
  while (space.isActive && steps < maxSteps) {
    const physDt = space.timestep; // snapshot BEFORE calculate() — adaptive may shrink it
    space.calculate(null, false);
    onStep?.(space, steps); // capture hitBodies/hitColliders before next calculate() clears them
    steps++;
    frames.push({
      timestep: physDt,
      positions: space.rigidbodies.map(b => ({
        id: b.id,
        x: b.collider.position.x,
        y: b.collider.position.y,
        z: b.collider.position.z,
      })),
    });
  }
  return frames;
}
