/**
 * GAME-010 — rack-positions golden tests.
 *
 * ALL expected values below come from C# runner `GetBallPosition(0..15)`
 * float output × 10000, trunc-toward-zero (`(long)` cast).
 * Source: /tmp/rack-golden/ (net8 runner, reproducible).
 * Cross-verified: 卡卡西 C# dump ↔ 千手 subagent scene read.
 *
 * These are NOT self-referential — they are independent of the TypeScript
 * formula in rack-positions.ts.  If the TS implementation drifts from C#,
 * one or more of these assertions will fail.
 */

import { describe, it, expect } from 'vitest';
import {
  getRackPosition,
  getAllRackPositions,
  RACK_APEX_X,
  CUE_BALL_START_X,
} from '../../game/rack-positions';

// ─── C# runner golden table ───────────────────────────────────────────────────
// Source: C# GetBallPosition(id) × 10000 → (long) trunc-toward-zero
// Unity scene: firstBall.localPosition.x=0.6413, ballDiameter=0.05715, ballDistance=0
const GOLDEN: ReadonlyArray<readonly [number, number]> = [
  [-6413,     0],   //  0: cue ball  (= -firstBall.x)
  [ 6413,     0],   //  1: apex
  [ 7897,   857],   //  2
  [ 8392, -1143],   //  3
  [ 8392,     0],   //  4
  [ 6907,   285],   //  5
  [ 7897,  -285],   //  6
  [ 8392,  1143],   //  7
  [ 7402,     0],   //  8: BLACK BALL (z=0 ✓)
  [ 7402,   571],   //  9
  [ 7402,  -571],   // 10
  [ 7897,   285],   // 11
  [ 7897,  -857],   // 12
  [ 6907,  -285],   // 13
  [ 8392,  -571],   // 14
  [ 8392,   571],   // 15
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('rack-positions — GAME-010', () => {

  describe('exported constants match C# scene values', () => {
    it('RACK_APEX_X = 6413  (C# firstBall.localPosition.x=0.6413 × 10000)', () => {
      expect(RACK_APEX_X).toBe(6413);
    });

    it('CUE_BALL_START_X = -6413  (= -firstBall.x)', () => {
      expect(CUE_BALL_START_X).toBe(-6413);
      expect(CUE_BALL_START_X).toBe(-RACK_APEX_X);
    });
  });

  describe('all 16 ball positions match C# runner dump (bit-exact)', () => {
    for (let id = 0; id < 16; id++) {
      const [expectedX, expectedZ] = GOLDEN[id];
      it(`ball id=${id} → x=${expectedX}, z=${expectedZ}`, () => {
        const pos = getRackPosition(id);
        expect(pos.x).toBe(expectedX);
        expect(pos.z).toBe(expectedZ);
      });
    }
  });

  describe('structural invariants (C# geometry guarantees)', () => {
    it('ball 8 (black) z=0 — center of rack (C# delta=(2,0))', () => {
      expect(getRackPosition(8).z).toBe(0);
    });

    it('ball 1 (apex) x=6413, z=0', () => {
      const p = getRackPosition(1);
      expect(p.x).toBe(6413);
      expect(p.z).toBe(0);
    });

    it('row-2 balls (8,9,10) share same x', () => {
      const x8  = getRackPosition(8).x;
      const x9  = getRackPosition(9).x;
      const x10 = getRackPosition(10).x;
      expect(x9).toBe(x8);
      expect(x10).toBe(x8);
    });

    it('pairs (5,13) and (6,11) are symmetric about z=0', () => {
      const p5  = getRackPosition(5);
      const p13 = getRackPosition(13);
      expect(p5.x).toBe(p13.x);
      expect(p5.z).toBe(-p13.z);

      const p6  = getRackPosition(6);
      const p11 = getRackPosition(11);
      expect(p6.x).toBe(p11.x);
      expect(p6.z).toBe(-p11.z);
    });

    it('all 15 rack balls (1–15) have distinct (x,z) positions', () => {
      const keys = Array.from({ length: 15 }, (_, i) => {
        const p = getRackPosition(i + 1);
        return `${p.x},${p.z}`;
      });
      expect(new Set(keys).size).toBe(15);
    });

    it('getAllRackPositions length = 16', () => {
      expect(getAllRackPositions().length).toBe(16);
    });

    it('getAllRackPositions matches getRackPosition element-by-element', () => {
      const all = getAllRackPositions();
      for (let id = 0; id < 16; id++) {
        expect(all[id]).toEqual(getRackPosition(id));
      }
    });
  });
});
