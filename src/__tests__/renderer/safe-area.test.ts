/**
 * P1-T11 FEAT-SET-008 — viewport / safe-area pure helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  computeViewportMetrics,
  safeAreaPaddingCss,
  readSafeAreaInsets,
} from '../../renderer/safe-area';

describe('computeViewportMetrics (SET-008)', () => {
  it('detects short landscape phone (844×390)', () => {
    const m = computeViewportMetrics(844, 390);
    expect(m.isLandscape).toBe(true);
    expect(m.isShortLandscape).toBe(true);
    expect(m.isPortraitMobile).toBe(false);
    expect(m.aspect).toBeCloseTo(844 / 390, 5);
  });

  it('detects portrait mobile (390×844)', () => {
    const m = computeViewportMetrics(390, 844);
    expect(m.isLandscape).toBe(false);
    expect(m.isPortraitMobile).toBe(true);
    expect(m.isShortLandscape).toBe(false);
  });

  it('desktop landscape is not short', () => {
    const m = computeViewportMetrics(1280, 720);
    expect(m.isLandscape).toBe(true);
    expect(m.isShortLandscape).toBe(false);
  });

  it('carries safe insets through', () => {
    const safe = { top: 44, right: 0, bottom: 34, left: 0 };
    const m = computeViewportMetrics(800, 400, safe);
    expect(m.safe).toEqual(safe);
  });
});

describe('safeAreaPaddingCss', () => {
  it('emits env(safe-area-inset-*) with extra floor', () => {
    const css = safeAreaPaddingCss(8);
    expect(css).toContain('env(safe-area-inset-top');
    expect(css).toContain('max(8px');
    expect(css).toContain('padding-left');
  });
});

describe('readSafeAreaInsets', () => {
  it('parses provided getComputed values', () => {
    const insets = readSafeAreaInsets((p) => {
      if (p === '--safe-area-top') return '47px';
      if (p === '--safe-area-left') return '0px';
      return '0';
    });
    expect(insets.top).toBe(47);
    expect(insets.left).toBe(0);
  });
});
