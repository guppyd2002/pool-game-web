/**
 * CUE-016 + CUE-001: cue-mesh pure helper tests.
 *
 * Tests the DOM-free geometry helpers: cueYAngle (aim direction → Three.js Y-rotation)
 * and lerpAngle (angle interpolation with ±π wrap). The Three.js mesh layer is
 * not unit-tested here (same pattern as aim-line.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { cueYAngle, lerpAngle } from '../../renderer/cue-mesh';

// ─── cueYAngle — aim direction (dx, dz) → Three.js Y rotation ────────────────
//
// Invariant: group.rotation.y = cueYAngle(dx, dz) makes the group's local +Z
// axis point in world direction (dx, 0, dz). Cue cylinder at local z < 0 then
// extends behind the ball in the -aim direction.

describe('cueYAngle: aim direction → Three.js Y rotation', () => {
  it('+Z aim → yAngle = 0 (local Z = world Z)', () => {
    expect(cueYAngle(0, 1)).toBeCloseTo(0, 6);
  });

  it('+X aim → yAngle = π/2 (local Z = world +X)', () => {
    expect(cueYAngle(1, 0)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('-Z aim → yAngle = ±π (local Z = world -Z)', () => {
    expect(Math.abs(cueYAngle(0, -1))).toBeCloseTo(Math.PI, 6);
  });

  it('-X aim → yAngle = -π/2 (local Z = world -X)', () => {
    expect(cueYAngle(-1, 0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('diagonal (+X, +Z) normalized → yAngle = π/4', () => {
    const s = Math.SQRT1_2;
    expect(cueYAngle(s, s)).toBeCloseTo(Math.PI / 4, 6);
  });

  it('diagonal (-X, +Z) normalized → yAngle = -π/4', () => {
    const s = Math.SQRT1_2;
    expect(cueYAngle(-s, s)).toBeCloseTo(-Math.PI / 4, 6);
  });
});

// ─── lerpAngle — interpolate angles with ±π wrap ─────────────────────────────
//
// Invariant: always takes the shortest arc (delta clamped to (-π, +π]).

describe('lerpAngle: smooth interpolation with wrap', () => {
  it('t=0 → no movement', () => {
    expect(lerpAngle(0.5, 2.0, 0)).toBeCloseTo(0.5, 10);
  });

  it('t=1 → reaches target (simple)', () => {
    expect(lerpAngle(0, 1, 1)).toBeCloseTo(1, 10);
  });

  it('t=0.5 → halfway (simple)', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('t=1 → reaches target across 0 (simple negative→positive)', () => {
    expect(lerpAngle(-0.5, 0.5, 1)).toBeCloseTo(0.5, 10);
  });

  it('wraps short path: 350° → 10° (20° forward, not 340° backward)', () => {
    const c = (350 * Math.PI) / 180;
    const t = (10 * Math.PI) / 180;
    const result = lerpAngle(c, t, 1);
    // Normalize to [0, 2π)
    const norm = ((result % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(norm).toBeCloseTo(t, 4);
  });

  it('wraps short path: 10° → 350° (−20° backward, not +340° forward)', () => {
    const c = (10 * Math.PI) / 180;
    const t = (350 * Math.PI) / 180;
    const result = lerpAngle(c, t, 1);
    const norm = ((result % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(norm).toBeCloseTo(t, 4);
  });

  it('-π and +π are the same angle: lerp gives no rotation', () => {
    const result = lerpAngle(-Math.PI, Math.PI, 0.5);
    expect(Math.abs(result)).toBeCloseTo(Math.PI, 4);
  });

  it('t clamped: overshooting t=2 does not overshoot target', () => {
    // When t > 1, Math.min(t, 1) ensures we stop at target
    expect(lerpAngle(0, 1, 2)).toBeCloseTo(1, 10);
  });
});
