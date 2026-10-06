/**
 * Phase 1 / 0-A — felt screen rect formula (C4).
 */
import { describe, it, expect } from 'vitest';
import {
  computeFeltScreenRect,
  LAYOUT_ORTHO_MARGIN,
  LAYOUT_TABLE_W_M,
  LAYOUT_TABLE_H_M,
} from '../../layout/felt-geometry';

describe('computeFeltScreenRect', () => {
  it('pins layout constants to scene.ts contract', () => {
    expect(LAYOUT_TABLE_W_M).toBe(2.54);
    expect(LAYOUT_TABLE_H_M).toBe(1.27);
    expect(LAYOUT_ORTHO_MARGIN).toBe(1.28);
  });

  it('CEO 1140×370 (aspect 3.08): ~78.1% H, ~50.7% W, gutters match design §0.1', () => {
    const r = computeFeltScreenRect(1140, 370);
    expect(r.heightFrac).toBeCloseTo(1 / 1.28, 5);
    expect(r.widthFrac).toBeCloseTo(2.0 / (1.28 * (1140 / 370)), 4);
    expect(r.gutterTop).toBeCloseTo(370 * (1 - 1 / 1.28) / 2, 1);
    expect(r.gutterLeft + r.width + r.gutterRight).toBeCloseTo(1140, 5);
    expect(r.gutterTop + r.height + r.gutterBottom).toBeCloseTo(370, 5);
  });

  it('square-ish 800×400 (aspect 2.0): felt fills width fraction at tableAspect', () => {
    const r = computeFeltScreenRect(800, 400);
    expect(r.aspect).toBeCloseTo(2, 5);
    expect(r.heightFrac).toBeCloseTo(1 / 1.28, 5);
    expect(r.widthFrac).toBeCloseTo(1 / 1.28, 5);
  });
});
