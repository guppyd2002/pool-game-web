/**
 * Phase 1 F-2b-5 — size side controls from --gutter-* (not wrapper max-width clamps).
 * Wrapper max-width does not shrink hard-coded children (power box 80 / eff ~38 bug).
 *
 * §F.19: unrotated gutter≈41 ⇒ usable < 44 is structural residual until F-4 rotate.
 * Never restore felt overflow to fake a T-rule PASS (#4 CEO defect).
 */

export const POWER_TRACK_W_NATURAL = 80;
export const SPIN_DISC_RADIUS_NATURAL = 65;
/** Collapsed spin button natural edge (was hard 68). */
export const SPIN_BTN_NATURAL = 68;
/**
 * Inset inside gutter so control does not kiss the felt edge.
 * Matches overlay anchor `felt-* + 4` (geometric cap = gutter − 4).
 * Was 8 from the removed wrapper max-width clamp; pad=4 closes CEO
 * narrow-gutter gap 47.03→43.03 (was 39.03).
 */
export const GUTTER_INNER_PAD_PX = 4;
/** Never return 0px — silent invisible control. */
export const SIZE_FROM_GUTTER_FLOOR_PX = 1;
/** Apple HIG T-rule minimum edge. */
export const T_RULE_MIN_PX = 44;
/**
 * F-4 rotated side gutter at 375×607 (§F.19 / design F.9).
 * Pin tests: power/spin sizes from this gutter must be ≥ T_RULE_MIN_PX.
 */
export const F4_SIDE_GUTTER_PX = 68.945;

export function readCssPxVar(
  el: Element,
  name: string,
  fallback: number,
): number {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * min(natural, max(floor, gutter − pad)) — child owns the size.
 * Warns (does not throw) when usable < T_RULE_MIN_PX — expected on unrotated
 * layout (§F.19.3); throw would brick Preview until F-4.
 */
export function sizeFromGutter(
  natural: number,
  gutterPx: number,
  pad = GUTTER_INNER_PAD_PX,
): number {
  const usable = gutterPx - pad;
  if (usable < T_RULE_MIN_PX) {
    console.warn(
      `[gutter-control-size] usable ${usable.toFixed(2)}px < ${T_RULE_MIN_PX}px T-rule ` +
        `(gutter=${gutterPx}, pad=${pad}). §F.19 structural residual until F-4 rotate.`,
    );
  }
  if (usable < SIZE_FROM_GUTTER_FLOOR_PX) {
    console.warn(
      `[gutter-control-size] usable ${usable}px below floor ${SIZE_FROM_GUTTER_FLOOR_PX}px; clamping to floor.`,
    );
    return Math.min(natural, SIZE_FROM_GUTTER_FLOOR_PX);
  }
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
