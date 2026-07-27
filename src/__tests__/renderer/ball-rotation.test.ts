/**
 * Unit tests for the ball rolling-rotation formula used in updateBallPosition.
 *
 * The formula derives an incremental world-axis quaternion from a horizontal
 * position delta (rolling without slip):
 *
 *   Given ball displacement (dx, 0, dz):
 *     dist = sqrt(dx² + dz²)
 *     axis = normalize(dz, 0, -dx)   ← perpendicular to motion, in XZ plane
 *     angle = dist / BALL_RADIUS      ← arc-length = R·θ
 *
 * Correctness criteria (right-hand rule, world Y-up):
 *   +Z motion → axis ≈ (+1,0,0) → ball top rolls toward +Z (forward roll) ✓
 *   +X motion → axis ≈ (0,0,-1) → ball top rolls toward +X (forward roll) ✓
 *   Zero delta  → no rotation
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

const BALL_RADIUS = 0.028575; // standard competition ball (57.15 mm diameter)
const EPSILON = 1e-6;         // minimum displacement to trigger rotation

function rollingDelta(
  dx: number,
  dz: number,
  radius: number,
): { axis: THREE.Vector3; angle: number } | null {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < EPSILON) return null;
  return {
    axis: new THREE.Vector3(dz / dist, 0, -dx / dist),
    angle: dist / radius,
  };
}

describe('ball rolling-rotation formula', () => {
  it('forward motion (+Z) → rotation axis is +X', () => {
    const result = rollingDelta(0, 0.1, BALL_RADIUS);
    expect(result).not.toBeNull();
    expect(result!.axis.x).toBeCloseTo(1, 5);
    expect(result!.axis.y).toBeCloseTo(0, 5);
    expect(result!.axis.z).toBeCloseTo(0, 5);
  });

  it('backward motion (−Z) → rotation axis is −X', () => {
    const result = rollingDelta(0, -0.1, BALL_RADIUS);
    expect(result).not.toBeNull();
    expect(result!.axis.x).toBeCloseTo(-1, 5);
    expect(result!.axis.y).toBeCloseTo(0, 5);
    expect(result!.axis.z).toBeCloseTo(0, 5);
  });

  it('rightward motion (+X) → rotation axis is −Z', () => {
    const result = rollingDelta(0.1, 0, BALL_RADIUS);
    expect(result).not.toBeNull();
    expect(result!.axis.x).toBeCloseTo(0, 5);
    expect(result!.axis.y).toBeCloseTo(0, 5);
    expect(result!.axis.z).toBeCloseTo(-1, 5);
  });

  it('leftward motion (−X) → rotation axis is +Z', () => {
    const result = rollingDelta(-0.1, 0, BALL_RADIUS);
    expect(result).not.toBeNull();
    expect(result!.axis.x).toBeCloseTo(0, 5);
    expect(result!.axis.y).toBeCloseTo(0, 5);
    expect(result!.axis.z).toBeCloseTo(1, 5);
  });

  it('angle = displacement / radius (arc-length = R·θ)', () => {
    const dz = 0.02857;          // exactly π·R → angle should be ≈π
    const result = rollingDelta(0, dz, BALL_RADIUS)!;
    expect(result.angle).toBeCloseTo(dz / BALL_RADIUS, 5);
  });

  it('zero displacement → null (no rotation, prevents jitter at rest)', () => {
    expect(rollingDelta(0, 0, BALL_RADIUS)).toBeNull();
    expect(rollingDelta(0, 1e-9, BALL_RADIUS)).toBeNull(); // below threshold
  });

  it('rotation axis is always in the XZ plane (Y=0)', () => {
    const cases = [
      [0.05, 0.08],
      [-0.03, 0.07],
      [0.1, -0.1],
    ] as const;
    for (const [dx, dz] of cases) {
      const r = rollingDelta(dx, dz, BALL_RADIUS)!;
      expect(r.axis.y).toBeCloseTo(0, 5);
      expect(r.axis.length()).toBeCloseTo(1, 5); // always normalised
    }
  });

  it('quaternion from forward roll: ball top (+Y) rotates toward +Z', () => {
    // Ball moves 0.01 m in +Z (small angle ~0.35 rad so top stays in forward hemisphere).
    // Rotation about +X axis: right-hand rule → +Y face rotates toward +Z. ✓
    const dz = 0.01;
    const result = rollingDelta(0, dz, BALL_RADIUS)!;
    const q = new THREE.Quaternion().setFromAxisAngle(result.axis, result.angle);
    // Apply to the "up" direction (top of ball in object space = +Y).
    const top = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // After rolling forward, the original top should have a +Z component.
    expect(top.z).toBeGreaterThan(0);
    // And the +Z face should now point somewhat downward (it rotated under the ball).
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(front.y).toBeLessThan(0);
  });

  it('quaternion from rightward roll: ball top (+Y) rotates toward +X', () => {
    // Ball moves 0.01 m in +X (small angle ~0.35 rad so top stays in forward hemisphere).
    // Rotation about −Z axis: right-hand rule → +Y face rotates toward +X. ✓
    const dx = 0.01;
    const result = rollingDelta(dx, 0, BALL_RADIUS)!;
    const q = new THREE.Quaternion().setFromAxisAngle(result.axis, result.angle);
    const top = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(top.x).toBeGreaterThan(0);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(right.y).toBeLessThan(0);
  });
});
