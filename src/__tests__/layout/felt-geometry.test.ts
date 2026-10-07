/**
 * Phase 1 / 0-A — felt screen rect formula (C4) + single-source ortho constants.
 */
import { describe, it, expect } from 'vitest';
import {
  computeFeltScreenRect,
  LAYOUT_ORTHO_MARGIN,
  LAYOUT_TABLE_W_M,
  LAYOUT_TABLE_H_M,
} from '../../layout/felt-geometry';
import {
  ORTHO_MARGIN,
  TABLE_W_M,
  TABLE_H_M,
} from '../../layout/ortho-constants';

describe('computeFeltScreenRect', () => {
  it('felt-geometry re-exports match ortho-constants single source', () => {
    expect(LAYOUT_TABLE_W_M).toBe(TABLE_W_M);
    expect(LAYOUT_TABLE_H_M).toBe(TABLE_H_M);
    expect(LAYOUT_ORTHO_MARGIN).toBe(ORTHO_MARGIN);
    expect(TABLE_W_M).toBe(2.54);
    expect(TABLE_H_M).toBe(1.27);
    expect(ORTHO_MARGIN).toBe(1.28);
  });

  it('CEO 1140×370: height util ≈78.1% at ORTHO_MARGIN 1.28 (design §0.1)', () => {
    const r = computeFeltScreenRect(1140, 370);
    expect(r.heightFrac).toBeCloseTo(1 / 1.28, 5);
    expect(r.widthFrac).toBeCloseTo(2.0 / (1.28 * (1140 / 370)), 4);
    expect(r.gutterTop).toBeCloseTo(370 * (1 - 1 / 1.28) / 2, 1);
    expect(r.gutterLeft + r.width + r.gutterRight).toBeCloseTo(1140, 5);
    expect(r.gutterTop + r.height + r.gutterBottom).toBeCloseTo(370, 5);
    // C4: felt stays inside view
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left + r.width).toBeLessThanOrEqual(1140 + 1e-6);
    expect(r.top + r.height).toBeLessThanOrEqual(370 + 1e-6);
  });

  it('square-ish 800×400 (aspect 2.0): felt fills at tableAspect', () => {
    const r = computeFeltScreenRect(800, 400);
    expect(r.aspect).toBeCloseTo(2, 5);
    expect(r.heightFrac).toBeCloseTo(1 / 1.28, 5);
    expect(r.widthFrac).toBeCloseTo(1 / 1.28, 5);
  });
});
