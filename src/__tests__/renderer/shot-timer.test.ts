/**
 * UI-024 / RULE-006 pure timer helpers (P1-T07).
 */
import { describe, it, expect } from 'vitest';
import {
  computeTimerTier,
  remainingDisplayS,
  isInGracePeriod,
  DEFAULT_SHOT_TIME_S,
  GAME_END_TIME_RATIO,
  WALL_CLOCK_SHOT_TIMER_ENABLED,
  createShotTimer,
} from '../../renderer/shot-timer';

describe('shot-timer pure helpers', () => {
  const T = 30;

  it('defaults match C# ratio 1.5×', () => {
    expect(DEFAULT_SHOT_TIME_S).toBe(30);
    expect(GAME_END_TIME_RATIO).toBeCloseTo(1.5, 5);
  });

  it('WALL_CLOCK_SHOT_TIMER_ENABLED is a boolean product switch (prep: false)', () => {
    expect(typeof WALL_CLOCK_SHOT_TIMER_ENABLED).toBe('boolean');
    // This prep branch defaults false (CEO-off). Flip to true re-enables clock.
    expect(WALL_CLOCK_SHOT_TIMER_ENABLED).toBe(false);
  });

  it('createShotTimer.start does not fire timeouts when wall-clock disabled', () => {
    const onShotTimeout = () => { throw new Error('should not fire'); };
    const onGameEndTimeout = () => { throw new Error('should not fire'); };
    let ticks = 0;
    const g = globalThis as unknown as {
      window?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
    };
    if (typeof g.window === 'undefined') {
      g.window = { setInterval, clearInterval };
    }
    const t = createShotTimer({
      onTick: () => { ticks++; },
      onShotTimeout,
      onGameEndTimeout,
      shotTimeS: 1,
      nowMs: () => 0,
    });
    t.start();
    expect(ticks).toBe(1); // one host clear-tick only; no interval
    t.stop();
    t.dispose();
  });

  it('computeTimerTier: ok → shot_timeout → game_end_timeout', () => {
    expect(computeTimerTier(0, T)).toBe('ok');
    expect(computeTimerTier(29.9, T)).toBe('ok');
    expect(computeTimerTier(30, T)).toBe('shot_timeout');
    expect(computeTimerTier(40, T)).toBe('shot_timeout');
    expect(computeTimerTier(45, T)).toBe('game_end_timeout');
    expect(computeTimerTier(100, T)).toBe('game_end_timeout');
  });

  it('remainingDisplayS counts down then grace to GameEndTime', () => {
    expect(remainingDisplayS(0, T)).toBe(30);
    expect(remainingDisplayS(10, T)).toBe(20);
    // In grace: 45 − elapsed
    expect(remainingDisplayS(30, T)).toBe(15);
    expect(remainingDisplayS(40, T)).toBe(5);
    expect(remainingDisplayS(45, T)).toBe(0);
  });

  it('isInGracePeriod only between ShotTime and GameEndTime', () => {
    expect(isInGracePeriod(0, T)).toBe(false);
    expect(isInGracePeriod(29, T)).toBe(false);
    expect(isInGracePeriod(30, T)).toBe(true);
    expect(isInGracePeriod(44.9, T)).toBe(true);
    expect(isInGracePeriod(45, T)).toBe(false);
  });
});
