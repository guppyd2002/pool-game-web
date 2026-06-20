/**
 * CUE-011: shot animation pure-function tests.
 * backswingOffset() and shotPunchOffset() cover all math used by the cue punch animation.
 */
import { describe, it, expect } from 'vitest';
import {
  backswingOffset,
  shotPunchOffset,
  SHOT_ANIM_DURATION,
  CUE_MAX_BACKSWING,
} from '../../game/shot-animation';

describe('SHOT_ANIM_DURATION', () => {
  it('matches C# CueManager.shotTime = 0.1', () => {
    expect(SHOT_ANIM_DURATION).toBe(0.1);
  });
});

describe('CUE_MAX_BACKSWING', () => {
  it('matches C# slider.localPosition.z = -0.25 * force01 at full power', () => {
    expect(CUE_MAX_BACKSWING).toBe(0.25);
  });
});

describe('backswingOffset', () => {
  it('power=0: zero offset', () => {
    expect(backswingOffset(0)).toBe(0);
  });

  it('power=1: CUE_MAX_BACKSWING', () => {
    expect(backswingOffset(1)).toBe(CUE_MAX_BACKSWING);
  });

  it('power=0.5: half of max', () => {
    expect(backswingOffset(0.5)).toBeCloseTo(CUE_MAX_BACKSWING / 2);
  });

  it('power=0.25: quarter of max', () => {
    expect(backswingOffset(0.25)).toBeCloseTo(CUE_MAX_BACKSWING * 0.25);
  });

  it('clamps below 0: returns 0', () => {
    expect(backswingOffset(-0.5)).toBe(0);
    expect(backswingOffset(-99)).toBe(0);
  });

  it('clamps above 1: returns CUE_MAX_BACKSWING', () => {
    expect(backswingOffset(1.5)).toBe(CUE_MAX_BACKSWING);
    expect(backswingOffset(99)).toBe(CUE_MAX_BACKSWING);
  });
});

describe('shotPunchOffset', () => {
  it('at elapsed=0: returns startOffset (full pullback)', () => {
    expect(shotPunchOffset(0, SHOT_ANIM_DURATION, 0.2)).toBeCloseTo(0.2);
  });

  it('at elapsed=duration: returns 0 (contact position)', () => {
    expect(shotPunchOffset(SHOT_ANIM_DURATION, SHOT_ANIM_DURATION, 0.2)).toBeCloseTo(0);
  });

  it('at elapsed=half duration: returns half startOffset', () => {
    expect(shotPunchOffset(SHOT_ANIM_DURATION / 2, SHOT_ANIM_DURATION, 0.2)).toBeCloseTo(0.1);
  });

  it('at elapsed=0.25*duration: returns 0.75*startOffset', () => {
    expect(shotPunchOffset(SHOT_ANIM_DURATION * 0.25, SHOT_ANIM_DURATION, 0.2)).toBeCloseTo(0.15);
  });

  it('past duration: clamps to 0', () => {
    expect(shotPunchOffset(SHOT_ANIM_DURATION * 2, SHOT_ANIM_DURATION, 0.2)).toBe(0);
    expect(shotPunchOffset(1.0, SHOT_ANIM_DURATION, 0.2)).toBe(0);
  });

  it('zero duration: always returns 0 (instant punch)', () => {
    expect(shotPunchOffset(0, 0, 0.2)).toBe(0);
  });

  it('startOffset=0: always returns 0 regardless of elapsed', () => {
    expect(shotPunchOffset(0, SHOT_ANIM_DURATION, 0)).toBe(0);
    expect(shotPunchOffset(SHOT_ANIM_DURATION / 2, SHOT_ANIM_DURATION, 0)).toBe(0);
    expect(shotPunchOffset(SHOT_ANIM_DURATION, SHOT_ANIM_DURATION, 0)).toBe(0);
  });

  it('full power full-duration shot: offset at max backswing linearly decreases', () => {
    const start = CUE_MAX_BACKSWING;
    const dur = SHOT_ANIM_DURATION;
    expect(shotPunchOffset(0, dur, start)).toBeCloseTo(start);
    expect(shotPunchOffset(dur * 0.5, dur, start)).toBeCloseTo(start * 0.5);
    expect(shotPunchOffset(dur, dur, start)).toBeCloseTo(0);
  });
});
