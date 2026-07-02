/**
 * 8BP v2.1 F-③ C-1 H-3 M-1: Tap-to-aim tests.
 *
 * All pure functions imported directly from cue-adapter.ts (production code).
 * Tests drive the same functions that onPointerUp calls — zero local re-implementation.
 *
 * Coverage:
 *   - computeTapAimPair: C-1 direction, M-3 fixed nd=1m, degenerate case
 *   - classifyTap: H-3 displacement-primary, 200ms NOT a hard gate (key regression guard)
 *   - TAP_MOVE_THRESH / TAP_TIME_THRESH exported constants
 *
 * F2 note (jsdom integration test): deferred — vitest env=node, no PointerEvent.
 * C-1 positive direction verified by 卡卡西 親讀 onPointerUp code path (dec4c9d).
 */
import { describe, it, expect } from 'vitest';
import {
  TAP_MOVE_THRESH,
  TAP_TIME_THRESH,
  classifyTap,
  computeTapAimPair,
} from '../../game/cue-adapter';

// ─── TAP constants ────────────────────────────────────────────────────────────

describe('Tap constants', () => {
  it('TAP_MOVE_THRESH is 10px', () => {
    expect(TAP_MOVE_THRESH).toBe(10);
  });

  it('TAP_TIME_THRESH is 800ms (long-press exclusion, not a tight gate)', () => {
    expect(TAP_TIME_THRESH).toBe(800);
  });
});

// ─── classifyTap — H-3 displacement-primary ───────────────────────────────────

describe('classifyTap() — H-3: displacement-primary, 800ms upper bound only', () => {
  it('small displacement + short elapsed → tap', () => {
    expect(classifyTap(5, 100)).toBe(true);
  });

  it('H-3 fix guard: small displacement + 300ms (> old 200ms) → STILL tap (慢速定點按)', () => {
    expect(classifyTap(3, 300)).toBe(true);
  });

  it('H-3 fix guard: small displacement + 500ms → STILL tap', () => {
    expect(classifyTap(2, 500)).toBe(true);
  });

  it('small displacement + elapsed > TAP_TIME_THRESH → NOT tap (pathological long-press only)', () => {
    expect(classifyTap(3, TAP_TIME_THRESH + 1)).toBe(false);
  });

  it('displacement >= TAP_MOVE_THRESH → NOT tap (drag), regardless of elapsed', () => {
    expect(classifyTap(TAP_MOVE_THRESH, 50)).toBe(false);
    expect(classifyTap(15, 50)).toBe(false);
  });

  it('displacement exactly at threshold → NOT tap (exclusive lower bound)', () => {
    expect(classifyTap(TAP_MOVE_THRESH, 100)).toBe(false);
  });

  it('displacement just below threshold → tap', () => {
    expect(classifyTap(TAP_MOVE_THRESH - 0.1, 100)).toBe(true);
  });
});

// ─── computeTapAimPair — C-1 direction + M-3 nd=1m ───────────────────────────

describe('computeTapAimPair() — C-1: positive direction, M-3: nd=1m', () => {
  it('C-1: (start − current) = +(tap − cueBall) — positive direction toward tap', () => {
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 1, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    const dirX = pair!.start.x - pair!.current.x;
    const dirZ = pair!.start.z - pair!.current.z;
    expect(dirX).toBeGreaterThan(0);
    expect(dirZ).toBeCloseTo(0, 5);
  });

  it('C-1 NOT reversed: direction same sign as (tap − cueBall)', () => {
    const cueBall = { x: 0, z: 0 };
    const tapPt = { x: 2, z: 3 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    const dirX = pair!.start.x - pair!.current.x;
    const dirZ = pair!.start.z - pair!.current.z;
    const tapDx = tapPt.x - cueBall.x;
    const tapDz = tapPt.z - cueBall.z;
    const nd = Math.sqrt(tapDx ** 2 + tapDz ** 2);
    expect(dirX).toBeCloseTo(tapDx / nd, 5);
    expect(dirZ).toBeCloseTo(tapDz / nd, 5);
  });

  it('current = cueBall (M-2: getAimHit reads this as cue ball position)', () => {
    const cueBall = { x: 1.5, z: -0.3 };
    const tapPt = { x: 2, z: 0 };
    const pair = computeTapAimPair(cueBall, tapPt);
    expect(pair).not.toBeNull();
    expect(pair!.current.x).toBeCloseTo(cueBall.x, 5);
    expect(pair!.current.z).toBeCloseTo(cueBall.z, 5);
  });

  it('M-3: nd = 1m for far tap (5m from cueBall)', () => {
    const pair = computeTapAimPair({ x: 0, z: 0 }, { x: 5, z: 0 });
    expect(pair).not.toBeNull();
    const d = Math.sqrt((pair!.start.x - pair!.current.x) ** 2 + (pair!.start.z - pair!.current.z) ** 2);
    expect(d).toBeCloseTo(1, 5);
  });

  it('M-3: nd = 1m for close tap (0.05m from cueBall) — avoids nd<0.001 failure', () => {
    const pair = computeTapAimPair({ x: 0, z: 0 }, { x: 0.05, z: 0 });
    expect(pair).not.toBeNull();
    const d = Math.sqrt((pair!.start.x - pair!.current.x) ** 2 + (pair!.start.z - pair!.current.z) ** 2);
    expect(d).toBeCloseTo(1, 5);
  });

  it('returns null for degenerate tap (tap === cueBall within 0.001)', () => {
    expect(computeTapAimPair({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    expect(computeTapAimPair({ x: 0, z: 0 }, { x: 0.0005, z: 0 })).toBeNull();
  });
});
