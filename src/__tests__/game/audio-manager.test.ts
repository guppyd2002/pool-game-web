/**
 * P1-T10 pure audio helpers (no AudioContext required).
 */
import { describe, it, expect } from 'vitest';
import {
  clipIndexFrom01,
  force01FromImpulseMag,
  planShotSfx,
  SFX_TIER_COUNT,
  BALL_HIT_THROTTLE_S,
} from '../../game/audio-manager';
import type { ContactEvent } from '../../game/ball-pool-physics';

describe('clipIndexFrom01 (AUD-001/002 tiering)', () => {
  it('maps 0→0 and 1→last tier', () => {
    expect(clipIndexFrom01(0, 4)).toBe(0);
    expect(clipIndexFrom01(0.99, 4)).toBe(3);
    expect(clipIndexFrom01(1, 4)).toBe(3);
  });

  it('clamps out of range', () => {
    expect(clipIndexFrom01(-1, 4)).toBe(0);
    expect(clipIndexFrom01(2, 4)).toBe(3);
  });

  it('default tier count is 4', () => {
    expect(SFX_TIER_COUNT).toBe(4);
    expect(clipIndexFrom01(0.5)).toBe(2);
  });
});

describe('force01FromImpulseMag', () => {
  it('scales by maxForce', () => {
    expect(force01FromImpulseMag(0, 13000)).toBe(0);
    expect(force01FromImpulseMag(6500, 13000)).toBeCloseTo(0.5, 5);
    expect(force01FromImpulseMag(20000, 13000)).toBe(1);
  });
});

describe('planShotSfx (AUD-002 throttle + AUD-003)', () => {
  const ball = (step: number): ContactEvent => ({
    stepIndex: step, kind: 'ball', ballId: 0, otherBallId: 1, cushionId: null,
  });
  const cush = (step: number): ContactEvent => ({
    stepIndex: step, kind: 'cushion', ballId: 2, otherBallId: null, cushionId: 0,
  });

  it('always starts with cueShot and includes cushions', () => {
    const { kinds } = planShotSfx([cush(1), cush(2)], 0, 0, 0.8, 10, 0);
    expect(kinds[0]).toBe('cueShot');
    expect(kinds.filter((k) => k === 'ballHitCushion').length).toBe(2);
  });

  it('throttles ball-ball within 0.35s window', () => {
    const contacts = [ball(1), ball(2), ball(3)];
    const { kinds, nextBallHitS } = planShotSfx(contacts, 0, 0, 1, 1.0, 0.9);
    // 1.0 - 0.9 = 0.1 < 0.35 → all ball hits skipped
    expect(kinds.filter((k) => k === 'ballHitBall').length).toBe(0);
    expect(nextBallHitS).toBe(0.9);
    expect(BALL_HIT_THROTTLE_S).toBeCloseTo(0.35, 5);
  });

  it('allows ball-ball after throttle elapsed', () => {
    const { kinds } = planShotSfx([ball(1)], 0, 0, 1, 2.0, 0.0);
    expect(kinds).toContain('ballHitBall');
  });

  it('adds pocket and out-of-table kinds', () => {
    const { kinds } = planShotSfx([], 2, 1, 0.5, 0, -1);
    expect(kinds.filter((k) => k === 'ballInPocket').length).toBe(2);
    expect(kinds.filter((k) => k === 'ballOutOfTable').length).toBe(1);
  });
});
