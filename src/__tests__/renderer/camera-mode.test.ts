/**
 * FEAT-CAM-002/003/004 lite — camera mode + FOV/follow helpers.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createCameraModeController,
  applyZoomFov,
  computeFollowLookAt,
  computeFollowFov,
} from '../../renderer/camera-mode';

describe('createCameraModeController (CAM-002)', () => {
  it('starts in overview by default', () => {
    const c = createCameraModeController();
    expect(c.mode).toBe('overview');
  });

  it('enterTable restores last play mode (default top)', () => {
    const c = createCameraModeController('overview');
    expect(c.enterTable()).toBe('top');
    expect(c.mode).toBe('top');
  });

  it('toggleTopOrbit cycles top ↔ orbit', () => {
    const c = createCameraModeController('top');
    expect(c.toggleTopOrbit()).toBe('orbit');
    expect(c.toggleTopOrbit()).toBe('top');
  });

  it('enterOverview remembers last play mode', () => {
    const c = createCameraModeController('top');
    c.setMode('orbit');
    c.enterOverview();
    expect(c.mode).toBe('overview');
    expect(c.enterTable()).toBe('orbit');
  });

  it('onChange fires with prev/next', () => {
    const spy = vi.fn();
    const c = createCameraModeController('overview', spy);
    c.enterTable();
    expect(spy).toHaveBeenCalledWith('top', 'overview');
  });
});

describe('applyZoomFov (CAM-003)', () => {
  it('clamps to [min,max]', () => {
    expect(applyZoomFov(50, -100, 28, 70)).toBe(28);
    expect(applyZoomFov(50, 100, 28, 70)).toBe(70);
    expect(applyZoomFov(50, -5, 28, 70)).toBe(45);
  });
});

describe('computeFollowLookAt / FOV (CAM-004 lite)', () => {
  it('empty → origin', () => {
    expect(computeFollowLookAt([])).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('weights faster balls more', () => {
    const look = computeFollowLookAt([
      { x: 0, y: 0, z: 0, speed: 0 },
      { x: 2, y: 0, z: 0, speed: 10 },
    ]);
    expect(look.x).toBeGreaterThan(1);
  });

  it('FOV boosts with speed', () => {
    expect(computeFollowFov(50, 0)).toBe(50);
    expect(computeFollowFov(50, 2.5)).toBe(62);
    expect(computeFollowFov(50, 100)).toBe(62); // capped boost
  });
});
