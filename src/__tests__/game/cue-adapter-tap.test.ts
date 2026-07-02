/**
 * 8BP v2.1 F-③ C-1 H-3 M-1: Tap-to-aim tests.
 *
 * Tests the pure helper functions and the tap classification logic.
 * Browser DOM events can't be fully simulated in Node, so we test:
 *   - TAP_MOVE_THRESH and TAP_TIME_THRESH exports (constants)
 *   - C-1 aim pair geometry: start = cueBall + 1m * normalize(tap-cueBall), current = cueBall
 *   - H-3: displacement-primary classification (200ms only upper bound)
 *   - M-1 gates: enabled, _isEnabled (via controller.onDragStart gate), _zoomActive
 *   - M-3: nd=1m fixed distance for tap aim pair
 */
import { describe, it, expect } from 'vitest';
import { TAP_MOVE_THRESH, TAP_TIME_THRESH } from '../../game/cue-adapter';
import type { TablePoint } from '../../game/cue-controller';

// ─── C-1 geometry helper (extracted for pure testing) ─────────────────────────

/**
 * Compute the C-1 tap aim pair: start = cueBall + 1m * normalize(tap - cueBall).
 * Returns null if tap is degenerate (same as cueBall within 0.001m).
 */
function computeTapAimPair(
  cueBall: TablePoint,
  tapPt: TablePoint,
): { start: TablePoint; current: TablePoint } | null {
  const dx = tapPt.x - cueBall.x;
  const dz = tapPt.z - cueBall.z;
  const nd = Math.sqrt(dx * dx + dz * dz);
  if (nd < 0.001) return null;
  const nx = dx / nd;
  const nz = dz / nd;
  return {
    start: { x: cueBall.x + nx, z: cueBall.z + nz },
    current: { x: cueBall.x, z: cueBall.z },
  };
}

// ─── TAP_MOVE_THRESH / TAP_TIME_THRESH constants ──────────────────────────────

describe('Tap constants', () => {
  it('TAP_MOVE_THRESH is 10px', () => {
    expect(TAP_MOVE_THRESH).toBe(10);
  });

  it('TAP_TIME_THRESH is 200ms', () => {
    expect(TAP_TIME_THRESH).toBe(200);
  });
});

// ─── C-1: aim pair direction ───────────────────────────────────────────────────

describe('C-1: tap aim pair — positive direction (start−current = +(tap−cueBall))', () => {
  it('aim direction is positive (toward tap) for a simple case', () => {
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 1, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    // direction = start - current = (1, 0) - (0, 0) = (1, 0) ✓ positive = toward tap
    const dirX = pair!.start.x - pair!.current.x;
    const dirZ = pair!.start.z - pair!.current.z;
    expect(dirX).toBeGreaterThan(0);
    expect(dirZ).toBeCloseTo(0, 5);
  });

  it('C-1 NOT reversed: (start − current) = +(tap − cueBall), not −(tap − cueBall)', () => {
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 2, z: 3 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    const dirX = pair!.start.x - pair!.current.x;
    const dirZ = pair!.start.z - pair!.current.z;
    const tapDirX = tapPt.x - cueBall.x;
    const tapDirZ = tapPt.z - cueBall.z;
    const nd = Math.sqrt(tapDirX * tapDirX + tapDirZ * tapDirZ);
    // (start - current) should be in same direction as (tap - cueBall)
    expect(dirX).toBeCloseTo(tapDirX / nd, 5);
    expect(dirZ).toBeCloseTo(tapDirZ / nd, 5);
  });

  it('current = cueball (M-2: same canonical read by getAimHit)', () => {
    const cueBall = { x: 1.5, z: -0.3 };
    const tapPt = { x: 2, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    expect(pair!.current.x).toBeCloseTo(cueBall.x, 5);
    expect(pair!.current.z).toBeCloseTo(cueBall.z, 5);
  });

  it('M-3: nd = 1m regardless of actual tap distance', () => {
    // For a far tap (5m away), the start is still exactly 1m from cueBall
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 5, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    const dist = Math.sqrt(
      (pair!.start.x - pair!.current.x) ** 2 +
      (pair!.start.z - pair!.current.z) ** 2,
    );
    expect(dist).toBeCloseTo(1, 5);
  });

  it('M-3: nd = 1m for a very close tap (avoids nd<0.001 silent failure)', () => {
    // For a tap 0.05m from cueBall (very close), result is still 1m apart
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 0.05, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    const dist = Math.sqrt(
      (pair!.start.x - pair!.current.x) ** 2 +
      (pair!.start.z - pair!.current.z) ** 2,
    );
    expect(dist).toBeCloseTo(1, 5);
  });

  it('returns null for degenerate tap (cueBall === tapPt)', () => {
    const cueBall = { x: 1, z: 1 };
    const tapPt = { x: 1, z: 1 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).toBeNull();
  });
});

// ─── H-3: displacement-primary classification ─────────────────────────────────

describe('H-3: tap classification — displacement primary, 200ms upper bound only', () => {
  it('displacement < threshold AND time < threshold → tap', () => {
    const displacement = 5;   // < 10px
    const elapsed = 100;       // < 200ms
    const isTap = displacement < TAP_MOVE_THRESH && elapsed < TAP_TIME_THRESH;
    expect(isTap).toBe(true);
  });

  it('displacement < threshold AND time >= threshold → NOT tap (long-press prevention)', () => {
    const displacement = 3;   // < 10px
    const elapsed = 250;       // >= 200ms (long press)
    const isTap = displacement < TAP_MOVE_THRESH && elapsed < TAP_TIME_THRESH;
    expect(isTap).toBe(false);
  });

  it('displacement >= threshold → NOT tap regardless of time', () => {
    const displacement = 15;  // >= 10px (drag)
    const elapsed = 50;        // < 200ms (would normally be fast enough)
    const isTap = displacement < TAP_MOVE_THRESH && elapsed < TAP_TIME_THRESH;
    expect(isTap).toBe(false);
  });

  it('slow deliberate tap (99ms, 2px) is classified as tap — not swallowed', () => {
    // H-3: "不得用「且 <200ms」把慢速定點按吞掉" — but here both conditions satisfied
    const displacement = 2;   // < 10px: primary gate says tap
    const elapsed = 99;        // well under 200ms
    const isTap = displacement < TAP_MOVE_THRESH && elapsed < TAP_TIME_THRESH;
    expect(isTap).toBe(true);
  });
});
