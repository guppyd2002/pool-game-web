/**
 * Phase 1 / 0-A — screen-space felt rectangle from ortho top-view formula.
 *
 * Mirrors `scene.ts` ORTHO_MARGIN + TABLE_W/H (nose-to-nose meters).
 * Used by layout-probe C4 red box and (later) --felt-* CSS vars.
 * Do NOT import physics constants here; do NOT change TABLE_W/H in physics.
 *
 * See phase1-layout-triage-design.md §0.1 / C4.
 */

/** Must match scene.ts TABLE_W (cushion nose-to-nose). */
export const LAYOUT_TABLE_W_M = 2.54;
/** Must match scene.ts TABLE_H. */
export const LAYOUT_TABLE_H_M = 1.27;
/** Must match scene.ts ORTHO_MARGIN. */
export const LAYOUT_ORTHO_MARGIN = 1.28;

export interface FeltScreenRect {
  /** CSS px relative to the canvas/view box origin (top-left). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Fractions of view (0–1). */
  widthFrac: number;
  heightFrac: number;
  gutterLeft: number;
  gutterRight: number;
  gutterTop: number;
  gutterBottom: number;
  aspect: number;
}

/**
 * Pure: given viewport/canvas CSS size, compute the felt (table nose) rectangle
 * under the same orthographic fit as `orthoFrustum` when drawing top-down.
 */
export function computeFeltScreenRect(viewWidth: number, viewHeight: number): FeltScreenRect {
  const w = Math.max(1, viewWidth);
  const h = Math.max(1, viewHeight);
  const aspect = w / h;

  const halfX = (LAYOUT_TABLE_W_M / 2) * LAYOUT_ORTHO_MARGIN;
  const halfZ = (LAYOUT_TABLE_H_M / 2) * LAYOUT_ORTHO_MARGIN;
  const tableAspect = halfX / halfZ; // 2.0 with current constants

  // Same branch as scene.ts orthoFrustum
  const hw = aspect >= tableAspect ? halfZ * aspect : halfX;
  const hh = aspect >= tableAspect ? halfZ : halfX / aspect;

  const widthFrac = LAYOUT_TABLE_W_M / 2 / hw;
  const heightFrac = LAYOUT_TABLE_H_M / 2 / hh;

  const width = w * widthFrac;
  const height = h * heightFrac;
  const left = (w - width) / 2;
  const top = (h - height) / 2;

  return {
    left,
    top,
    width,
    height,
    widthFrac,
    heightFrac,
    gutterLeft: left,
    gutterRight: w - left - width,
    gutterTop: top,
    gutterBottom: h - top - height,
    aspect,
  };
}
