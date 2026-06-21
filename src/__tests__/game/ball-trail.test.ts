/**
 * GAME-013 — ball-trail toggle tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBallTrail } from '../../game/ball-trail';

describe('ball-trail — GAME-013', () => {
  it('starts enabled', () => {
    const trail = createBallTrail();
    expect(trail.isEnabled).toBe(true);
  });

  it('disable() sets isEnabled to false (C# SelectBall)', () => {
    const trail = createBallTrail();
    trail.disable();
    expect(trail.isEnabled).toBe(false);
  });

  it('enable() sets isEnabled to true (C# UnselectBal)', () => {
    const trail = createBallTrail();
    trail.disable();
    trail.enable();
    expect(trail.isEnabled).toBe(true);
  });

  it('onChange fires when disabled', () => {
    const trail = createBallTrail();
    const fn = vi.fn();
    trail.onChange(fn);
    trail.disable();
    expect(fn).toHaveBeenCalledWith(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onChange fires when re-enabled', () => {
    const trail = createBallTrail();
    const fn = vi.fn();
    trail.onChange(fn);
    trail.disable();
    trail.enable();
    expect(fn).toHaveBeenCalledWith(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('onChange does NOT fire if state is already correct (disable twice)', () => {
    const trail = createBallTrail();
    const fn = vi.fn();
    trail.onChange(fn);
    trail.disable();
    trail.disable();  // second call — no-op
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const trail = createBallTrail();
    const fn = vi.fn();
    const unsub = trail.onChange(fn);
    unsub();
    trail.disable();
    expect(fn).not.toHaveBeenCalled();
  });
});
