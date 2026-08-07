/**
 * FEAT-CAM-008 RotationQuad pure math tests.
 */
import { describe, it, expect } from 'vitest';
import { getQuadPosition } from '../../renderer/rotation-quad';

const origin = { x: 0, y: 0, z: 0 };
const right = { x: 1, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const upY = 1.2;

describe('getQuadPosition (CAM-008)', () => {
  it('places camera opposite pivotForward on axis-aligned frame', () => {
    // Quad at origin, half-extents 2×1.5, pivot at origin looking +Z
    // → camera should sit on -Z side of the frame
    const p = getQuadPosition(
      { x: 0, y: upY, z: 0 },
      2, 1.5,
      right, forward,
      origin,
      { x: 0, y: 0, z: 1 },
      0,
    );
    expect(p.y).toBeCloseTo(upY, 5); // lifted to quad Y
    expect(p.z).toBeLessThan(0); // behind look direction
    expect(Math.abs(p.x)).toBeLessThan(0.01);
  });

  it('smoothCorners01=0 and 1 both finite and differ on diagonal aim', () => {
    const pivotFwd = { x: 0.7071, y: 0, z: 0.7071 };
    const sharp = getQuadPosition(
      { x: 0, y: 1, z: 0 }, 2, 2, right, forward, origin, pivotFwd, 0,
    );
    const smooth = getQuadPosition(
      { x: 0, y: 1, z: 0 }, 2, 2, right, forward, origin, pivotFwd, 1,
    );
    expect(Number.isFinite(sharp.x + sharp.z)).toBe(true);
    expect(Number.isFinite(smooth.x + smooth.z)).toBe(true);
    // Ellipse blend typically differs from pure min(rX,rZ) on diagonal
    const d =
      Math.abs(sharp.x - smooth.x) + Math.abs(sharp.z - smooth.z);
    expect(d).toBeGreaterThan(0);
  });

  it('clamps smoothCorners01 outside [0,1]', () => {
    const a = getQuadPosition(
      origin, 1, 1, right, forward, origin, { x: 0, y: 0, z: 1 }, -1,
    );
    const b = getQuadPosition(
      origin, 1, 1, right, forward, origin, { x: 0, y: 0, z: 1 }, 0,
    );
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.z).toBeCloseTo(b.z, 5);
  });
});
