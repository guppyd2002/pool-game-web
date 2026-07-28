/**
 * SP-Harden-3b: short-landscape perspective play pose selection.
 */
import { describe, it, expect } from 'vitest';
import {
  getPlayView,
  POSE_TABLE,
  POSE_TABLE_MOBILE,
  FOV_TABLE,
  FOV_TABLE_MOBILE,
} from '../../renderer/camera-tween';

describe('getPlayView — SP-Harden-3b short landscape', () => {
  it('desktop 1280×800 uses standard table pose + FOV', () => {
    const v = getPlayView(1280, 800);
    expect(v.pose).toEqual(POSE_TABLE);
    expect(v.fov).toBe(FOV_TABLE);
  });

  it('iPhone landscape 844×390 pulls back to mobile pose + lower FOV', () => {
    const v = getPlayView(844, 390);
    expect(v.pose).toEqual(POSE_TABLE_MOBILE);
    expect(v.fov).toBe(FOV_TABLE_MOBILE);
    // Mobile pose is higher and further back than desktop
    expect(v.pose.position[1]).toBeGreaterThan(POSE_TABLE.position[1]);
    expect(v.pose.position[2]).toBeGreaterThan(POSE_TABLE.position[2]);
  });

  it('short height 440 still uses mobile pose', () => {
    expect(getPlayView(900, 440).pose).toEqual(POSE_TABLE_MOBILE);
  });

  it('tall phone portrait-ish height uses desktop pose', () => {
    expect(getPlayView(390, 844).pose).toEqual(POSE_TABLE);
  });
});
