/**
 * Phase 1 F-2b-5 — size side controls from --gutter-* (not wrapper max-width clamps).
 * Wrapper max-width does not shrink hard-coded children (power box 80 / eff ~38 bug).
 */

export const POWER_TRACK_W_NATURAL = 80;
export const SPIN_DISC_RADIUS_NATURAL = 65;
/** Collapsed spin button natural edge (was hard 68). */
export const SPIN_BTN_NATURAL = 68;
/** Padding inside gutter so control does not kiss the felt edge. */
export const GUTTER_INNER_PAD_PX = 8;

export function readCssPxVar(
  el: Element,
  name: string,
  fallback: number,
): number {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** min(natural, max(0, gutter − pad)) — child owns the size. */
export function sizeFromGutter(natural: number, gutterPx: number, pad = GUTTER_INNER_PAD_PX): number {
  const usable = Math.max(0, gutterPx - pad);
  return Math.min(natural, usable);
}

export function powerTrackWidthFromGutter(gutterRightPx: number): number {
  return sizeFromGutter(POWER_TRACK_W_NATURAL, gutterRightPx);
}

/** Disc radius from left (or right in left-hand) gutter. */
export function spinDiscRadiusFromGutter(gutterSidePx: number): number {
  const diameter = sizeFromGutter(SPIN_DISC_RADIUS_NATURAL * 2, gutterSidePx);
  return diameter / 2;
}

export function spinBtnSizeFromGutter(gutterSidePx: number): number {
  return sizeFromGutter(SPIN_BTN_NATURAL, gutterSidePx);
}
