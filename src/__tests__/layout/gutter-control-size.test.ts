/**
 * Phase 1 F-2b-5 — gutter-driven control size helpers.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  F4_SIDE_GUTTER_PX,
  GUTTER_INNER_PAD_PX,
  POWER_TRACK_W_NATURAL,
  SIZE_FROM_GUTTER_FLOOR_PX,
  SPIN_BTN_NATURAL,
  SPIN_DISC_RADIUS_NATURAL,
  T_RULE_MIN_PX,
  powerTrackWidthFromGutter,
  readCssPxVar,
  sizeFromGutter,
  spinBtnSizeFromGutter,
  spinDiscRadiusFromGutter,
} from '../../layout/gutter-control-size';

describe('gutter-control-size F-2b-5', () => {
  it('sizeFromGutter keeps natural when gutter is ample', () => {
    expect(sizeFromGutter(80, 120)).toBe(80);
    expect(sizeFromGutter(80, 80 + GUTTER_INNER_PAD_PX)).toBe(80);
  });

  it('sizeFromGutter clamps to usable gutter (gutter − pad), never 0', () => {
    expect(sizeFromGutter(80, 40)).toBe(40 - GUTTER_INNER_PAD_PX);
    expect(sizeFromGutter(80, GUTTER_INNER_PAD_PX)).toBe(SIZE_FROM_GUTTER_FLOOR_PX);
    expect(sizeFromGutter(80, 0)).toBe(SIZE_FROM_GUTTER_FLOOR_PX);
    expect(sizeFromGutter(80, 2)).toBe(SIZE_FROM_GUTTER_FLOOR_PX);
  });

  it('sizeFromGutter warns when usable < T-rule 44 (structural residual)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sizeFromGutter(80, 41.016); // unrotated §F.19
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/structural residual|T-rule/i);
    warn.mockRestore();
  });

  it('powerTrackWidthFromGutter = min(80, gutter − pad)', () => {
    expect(powerTrackWidthFromGutter(200)).toBe(POWER_TRACK_W_NATURAL);
    expect(powerTrackWidthFromGutter(50)).toBe(50 - GUTTER_INNER_PAD_PX);
  });

  it('spinDiscRadiusFromGutter derives radius from diameter clamp', () => {
    expect(spinDiscRadiusFromGutter(200)).toBe(SPIN_DISC_RADIUS_NATURAL);
    // usable diameter 40 → radius 20
    expect(spinDiscRadiusFromGutter(40 + GUTTER_INNER_PAD_PX)).toBe(20);
  });

  it('spinBtnSizeFromGutter clamps collapsed button edge', () => {
    expect(spinBtnSizeFromGutter(200)).toBe(SPIN_BTN_NATURAL);
    expect(spinBtnSizeFromGutter(40)).toBe(40 - GUTTER_INNER_PAD_PX);
  });

  it('F-4 rotated side gutter pins T-rule ≥44 (structural guarantee)', () => {
    expect(GUTTER_INNER_PAD_PX).toBe(4);
    expect(F4_SIDE_GUTTER_PX - GUTTER_INNER_PAD_PX).toBeGreaterThanOrEqual(T_RULE_MIN_PX);
    expect(spinBtnSizeFromGutter(F4_SIDE_GUTTER_PX)).toBeGreaterThanOrEqual(T_RULE_MIN_PX);
    expect(powerTrackWidthFromGutter(F4_SIDE_GUTTER_PX)).toBeGreaterThanOrEqual(T_RULE_MIN_PX);
  });

  describe('readCssPxVar', () => {
    let el: HTMLElement;
    beforeEach(() => {
      el = document.createElement('div');
      document.body.appendChild(el);
    });
    afterEach(() => {
      el.remove();
    });

    it('reads inline CSS px vars', () => {
      el.style.setProperty('--gutter-right', '46px');
      expect(readCssPxVar(el, '--gutter-right', 80)).toBe(46);
    });

    it('falls back to natural-size fallback when missing or non-numeric', () => {
      // Callers must pass natural (+ pad) — never 0 — so first paint is not 0px.
      expect(readCssPxVar(el, '--gutter-right', POWER_TRACK_W_NATURAL + GUTTER_INNER_PAD_PX))
        .toBe(POWER_TRACK_W_NATURAL + GUTTER_INNER_PAD_PX);
      el.style.setProperty('--gutter-right', 'nope');
      expect(readCssPxVar(el, '--gutter-right', POWER_TRACK_W_NATURAL + GUTTER_INNER_PAD_PX))
        .toBe(POWER_TRACK_W_NATURAL + GUTTER_INNER_PAD_PX);
    });
  });
});
