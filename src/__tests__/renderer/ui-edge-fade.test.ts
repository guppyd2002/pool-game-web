/**
 * CUE-021: computeUIAlpha — UI overlay fade when table overlaps UI elements.
 *
 * C# source: CueManager.CheckUIPoint()
 *   deltaY = (uiDownPoint.position.y - GetUpperTablePointY()) / Screen.height
 *   if (deltaY <= 0) alpha = Mathf.Lerp(1f, 0.1f, -20f * deltaY)  [clamped t]
 *   else             alpha = 1f
 *
 * Web mapping (CSS Y-down vs Unity Y-up):
 *   deltaY = (tableTopCssY - uiBottomCssY) / screenHeight
 *   Same formula thereafter.  Full fade (0.1) when overlap ≥ screenH/20 = 5%.
 */
import { describe, it, expect } from 'vitest';
import { computeUIAlpha } from '../../renderer/ui-edge-fade';

// Helper: full-fade threshold overlap in pixels = screenHeight / 20
const SCREEN_H = 600;
const TABLE_TOP = 300;  // arbitrary pocket top CSS Y

describe('computeUIAlpha — no overlap (UI above table)', () => {
  it('returns 1.0 when UI bottom is above table top', () => {
    // uiBottomCssY=200, tableTopCssY=300 → UI is higher on screen (smaller CSS Y) → no overlap
    expect(computeUIAlpha(200, TABLE_TOP, SCREEN_H)).toBeCloseTo(1.0);
  });

  it('returns 1.0 when UI bottom exactly equals table top (boundary)', () => {
    expect(computeUIAlpha(TABLE_TOP, TABLE_TOP, SCREEN_H)).toBeCloseTo(1.0);
  });

  it('returns 1.0 when UI is far above table', () => {
    expect(computeUIAlpha(0, TABLE_TOP, SCREEN_H)).toBeCloseTo(1.0);
  });
});

describe('computeUIAlpha — partial overlap', () => {
  it('returns < 1.0 when UI bottom is below table top by 1px', () => {
    const alpha = computeUIAlpha(TABLE_TOP + 1, TABLE_TOP, SCREEN_H);
    expect(alpha).toBeLessThan(1.0);
    expect(alpha).toBeGreaterThan(0.1);
  });

  it('correct alpha at half-fade: overlap = screenH/40 (t=0.5)', () => {
    // t = -20 * deltaY = 0.5 → deltaY = -0.025 → uiBottom = tableTop + 0.025*screenH
    const overlap = 0.025 * SCREEN_H;  // 15px
    const alpha = computeUIAlpha(TABLE_TOP + overlap, TABLE_TOP, SCREEN_H);
    // alpha = Lerp(1, 0.1, 0.5) = 0.55
    expect(alpha).toBeCloseTo(0.55, 2);
  });

  it('correct alpha at quarter-fade: overlap = screenH/80 (t=0.25)', () => {
    const overlap = 0.025 * SCREEN_H / 2;  // 7.5px
    const alpha = computeUIAlpha(TABLE_TOP + overlap, TABLE_TOP, SCREEN_H);
    // alpha = Lerp(1, 0.1, 0.25) = 0.775
    expect(alpha).toBeCloseTo(0.775, 2);
  });

  it('monotonically decreasing as overlap increases', () => {
    const overlaps = [0, 5, 10, 15, 20, 25, 30];
    const alphas = overlaps.map(o => computeUIAlpha(TABLE_TOP + o, TABLE_TOP, SCREEN_H));
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1]);
    }
  });
});

describe('computeUIAlpha — full fade (minimum alpha 0.1)', () => {
  it('returns 0.1 at full-fade threshold: overlap = screenH/20', () => {
    const overlap = SCREEN_H / 20;  // 30px
    expect(computeUIAlpha(TABLE_TOP + overlap, TABLE_TOP, SCREEN_H)).toBeCloseTo(0.1, 3);
  });

  it('returns 0.1 when overlap exceeds threshold (clamped, not negative)', () => {
    expect(computeUIAlpha(TABLE_TOP + 100, TABLE_TOP, SCREEN_H)).toBeCloseTo(0.1, 3);
  });

  it('returns 0.1 even when UI is at very bottom of screen', () => {
    expect(computeUIAlpha(SCREEN_H, TABLE_TOP, SCREEN_H)).toBeCloseTo(0.1, 3);
  });

  it('minimum alpha never goes below 0.1', () => {
    for (const offset of [30, 100, 300, 599]) {
      const alpha = computeUIAlpha(TABLE_TOP + offset, TABLE_TOP, SCREEN_H);
      expect(alpha).toBeGreaterThanOrEqual(0.1 - 1e-9);
    }
  });
});

describe('computeUIAlpha — edge cases', () => {
  it('works with different screen heights', () => {
    // Same relative positions (5% overlap) should give same alpha regardless of screen size
    const screenH = 1200;
    const tableTopY = 600;
    const overlap = screenH / 20;  // 5% = full fade threshold
    expect(computeUIAlpha(tableTopY + overlap, tableTopY, screenH)).toBeCloseTo(0.1, 3);
  });

  it('returns value in [0.1, 1.0] for all inputs', () => {
    const cases: [number, number, number][] = [
      [0, 300, 600],
      [300, 300, 600],
      [400, 300, 600],
      [600, 300, 600],
      [100, 0, 800],
    ];
    for (const [ui, tbl, h] of cases) {
      const a = computeUIAlpha(ui, tbl, h);
      expect(a).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(a).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });
});
