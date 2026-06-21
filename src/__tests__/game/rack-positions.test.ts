/**
 * GAME-010 — rack-positions golden tests.
 *
 * C#-derived constants (from BallPool8Manager.cs + physics/constants.ts):
 *   BALL_RADIUS   = 285
 *   BALL_SPACING  = 285*2+5 = 575
 *   RACK_ROW_STEP = Math.trunc(575 * 866 / 1000) = 497   (≈ sqrt(3)*halfSpacing)
 *   RACK_COL_STEP = Math.trunc(575 / 2)          = 287   (half-spacing)
 *   RAIL_LONG_X   = 12699
 *   RACK_APEX_X   = Math.trunc(12699 / 2)        = 6349  (foot spot)
 *   CUE_BALL_START_X = -6349
 *
 * All 16 expected positions below are derived by hand from C# delta array
 * (BallPool8Manager.cs:10-28) applied to these constants — NOT computed from
 * the module under test. This proves the port is bit-exact even if constants change.
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

// ─── C#-derived golden constants ─────────────────────────────────────────────
// These are hardcoded integers, NOT computed from the module.
// If the module changes a constant, these will fail — that's the point.

const G_APEX_X    = 6349;   // = Math.trunc(12699 / 2)
const G_ROW_STEP  = 497;    // = Math.trunc(575 * 866 / 1000)
const G_COL_STEP  = 287;    // = Math.trunc(575 / 2)
const G_CUE_X     = -6349;

// ─── Full golden table (all 16 balls) ────────────────────────────────────────
// Derived: id N → DELTA[N] = [dr, dc] → (G_APEX_X + dr*G_ROW_STEP, dc*G_COL_STEP)
// id 0 is special: (G_CUE_X, 0)
const GOLDEN: ReadonlyArray<readonly [number, number]> = [
  [-6349,     0],   //  0: cue ball at break spot
  [ 6349,     0],   //  1: apex / foot spot   DELTA=(0,0)
  [ 7840,   861],   //  2:                    DELTA=(3,+3) → 6349+1491, 3*287
  [ 8337, -1148],   //  3:                    DELTA=(4,-4) → 6349+1988, -4*287
  [ 8337,     0],   //  4:                    DELTA=(4, 0)
  [ 6846,   287],   //  5:                    DELTA=(1,+1)
  [ 7840,  -287],   //  6:                    DELTA=(3,-1)
  [ 8337,  1148],   //  7:                    DELTA=(4,+4)
  [ 7343,     0],   //  8: BLACK BALL         DELTA=(2, 0) ← must be center z=0
  [ 7343,   574],   //  9:                    DELTA=(2,+2)
  [ 7343,  -574],   // 10:                    DELTA=(2,-2)
  [ 7840,   287],   // 11:                    DELTA=(3,+1)
  [ 7840,  -861],   // 12:                    DELTA=(3,-3)
  [ 6846,  -287],   // 13:                    DELTA=(1,-1)
  [ 8337,  -574],   // 14:                    DELTA=(4,-2)
  [ 8337,   574],   // 15:                    DELTA=(4,+2)
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('rack-positions — GAME-010', () => {

  describe('module constants match C#-derived golden integers', () => {
    it('RACK_APEX_X = 6349 (Math.trunc(RAIL_LONG_X/2) with RAIL_LONG_X=12699)', () => {
      expect(RACK_APEX_X).toBe(G_APEX_X);
    });

    it('RACK_ROW_STEP = 497 (Math.trunc(575*866/1000))', () => {
      expect(RACK_ROW_STEP).toBe(G_ROW_STEP);
    });

    it('RACK_COL_STEP = 287 (Math.trunc(575/2))', () => {
      expect(RACK_COL_STEP).toBe(G_COL_STEP);
    });

    it('CUE_BALL_START_X = -6349', () => {
      expect(CUE_BALL_START_X).toBe(G_CUE_X);
      expect(CUE_BALL_START_X).toBe(-RACK_APEX_X);
    });
  });

  describe('all 16 ball positions match C#-derived golden table', () => {
    for (let id = 0; id < 16; id++) {
      const [expectedX, expectedZ] = GOLDEN[id];
      it(`ball id=${id} → x=${expectedX}, z=${expectedZ}`, () => {
        const pos = getRackPosition(id);
        expect(pos.x).toBe(expectedX);
        expect(pos.z).toBe(expectedZ);
      });
    }
  });

  describe('structural invariants', () => {
    it('ball 8 (black) z=0 — center of rack row 2', () => {
      expect(getRackPosition(8).z).toBe(0);
    });

    it('ball 1 is at apex x=6349', () => {
      expect(getRackPosition(1).x).toBe(G_APEX_X);
    });

    it('row-1 pair (5, 13) symmetric about z=0', () => {
      const p5  = getRackPosition(5);
      const p13 = getRackPosition(13);
      expect(p5.x).toBe(p13.x);
      expect(p5.z).toBe(-p13.z);
      expect(p5.z).toBeGreaterThan(0);
    });

    it('all 15 rack balls (1–15) have distinct (x,z) positions', () => {
      const keys = Array.from({ length: 15 }, (_, i) => {
        const p = getRackPosition(i + 1);
        return `${p.x},${p.z}`;
      });
      expect(new Set(keys).size).toBe(15);
    });

    it('getAllRackPositions returns array of length 16', () => {
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
