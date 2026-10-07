/**
 * Phase 1 F-2b-5 — gutter-driven control size helpers.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  GUTTER_INNER_PAD_PX,
  POWER_TRACK_W_NATURAL,
  SPIN_BTN_NATURAL,
  SPIN_DISC_RADIUS_NATURAL,
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

  it('sizeFromGutter clamps to usable gutter (gutter − pad)', () => {
    expect(sizeFromGutter(80, 40)).toBe(40 - GUTTER_INNER_PAD_PX);
    expect(sizeFromGutter(80, 8)).toBe(0);
    expect(sizeFromGutter(80, 4)).toBe(0);
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

    it('falls back when missing or non-numeric', () => {
      expect(readCssPxVar(el, '--gutter-right', 80)).toBe(80);
      el.style.setProperty('--gutter-right', 'nope');
      expect(readCssPxVar(el, '--gutter-right', 80)).toBe(80);
    });
  });
});
