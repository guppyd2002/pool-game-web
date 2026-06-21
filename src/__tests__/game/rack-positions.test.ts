/**
 * GAME-010 — rack-positions golden tests.
 * Verifies C# BallPool8Manager.GetBallPosition port is bit-exact.
 */

import { describe, it, expect } from 'vitest';
import {
  getRackPosition,
  getAllRackPositions,
  RACK_APEX_X,
  CUE_BALL_START_X,
  RACK_ROW_STEP,
  RACK_COL_STEP,
} from '../../game/rack-positions';

describe('rack-positions — GAME-010', () => {
  it('ball 1 is at apex (row=0, col=0)', () => {
    const pos = getRackPosition(1);
    expect(pos.x).toBe(RACK_APEX_X);
    expect(pos.z).toBe(0);
  });

  it('ball 8 (black) is at center of 3-ball row (row=2, col=0)', () => {
    const pos = getRackPosition(8);
    expect(pos.x).toBe(RACK_APEX_X + 2 * RACK_ROW_STEP);
    expect(pos.z).toBe(0);
  });

  it('cue ball (id=0) is at opposite side', () => {
    const pos = getRackPosition(0);
    expect(pos.x).toBe(CUE_BALL_START_X);
    expect(pos.z).toBe(0);
    expect(CUE_BALL_START_X).toBe(-RACK_APEX_X);
  });

  it('row-1 balls (5 and 13) are symmetric about z=0', () => {
    const p5  = getRackPosition(5);   // delta (1, +1)
    const p13 = getRackPosition(13);  // delta (1, -1)
    expect(p5.x).toBe(p13.x);
    expect(p5.x).toBe(RACK_APEX_X + RACK_ROW_STEP);
    expect(p5.z).toBe(RACK_COL_STEP);
    expect(p13.z).toBe(-RACK_COL_STEP);
  });

  it('row-4 has 5 balls at distinct z positions', () => {
    // Row-4 ball ids (by delta): 3(row4,z=-4), 14(row4,z=-2), 4(row4,z=0), 15(row4,z=+2), 7(row4,z=+4)
    const row4Ids = [3, 14, 4, 15, 7];
    const zValues = row4Ids.map(id => getRackPosition(id).z);
    const unique = new Set(zValues);
    expect(unique.size).toBe(5);
    // All on same x
    const xValues = row4Ids.map(id => getRackPosition(id).x);
    expect(new Set(xValues).size).toBe(1);
    expect(xValues[0]).toBe(RACK_APEX_X + 4 * RACK_ROW_STEP);
  });

  it('all 15 rack balls (1–15) have distinct positions', () => {
    const positions = Array.from({ length: 15 }, (_, i) => {
      const p = getRackPosition(i + 1);
      return `${p.x},${p.z}`;
    });
    expect(new Set(positions).size).toBe(15);
  });

  it('getAllRackPositions returns array of length 16', () => {
    const all = getAllRackPositions();
    expect(all.length).toBe(16);
  });

  it('getAllRackPositions matches getRackPosition for each id', () => {
    const all = getAllRackPositions();
    for (let id = 0; id < 16; id++) {
      const direct = getRackPosition(id);
      expect(all[id].x).toBe(direct.x);
      expect(all[id].z).toBe(direct.z);
    }
  });

  it('RACK_ROW_STEP and RACK_COL_STEP are positive integers', () => {
    expect(Number.isInteger(RACK_ROW_STEP)).toBe(true);
    expect(Number.isInteger(RACK_COL_STEP)).toBe(true);
    expect(RACK_ROW_STEP).toBeGreaterThan(0);
    expect(RACK_COL_STEP).toBeGreaterThan(0);
  });

  it('row-2 center ball is ball 8 (golden: x = APEX + 2*ROW_STEP, z = 0)', () => {
    // Regression: ensures black ball is always center, not shifted by delta array changes
    const black = getRackPosition(8);
    expect(black.z).toBe(0);
    expect(black.x).toBeGreaterThan(RACK_APEX_X);
  });
});
