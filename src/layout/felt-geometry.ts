/**
 * Phase 1 / 0-A — screen-space felt rectangle from ortho top-view formula.
 *
 * Constants: single source `ortho-constants.ts` (shared with scene.ts).
 * Used by layout-probe C4 red box and --felt-* / --gutter-* CSS vars.
 * Do NOT import physics constants; do NOT change TABLE_W/H.
 */

import {
  ORTHO_MARGIN,
  TABLE_H_M,
  TABLE_W_M,
  orthoFrustum,
} from './ortho-constants';

/** @deprecated Prefer TABLE_W_M from ortho-constants — re-export for older imports. */
export const LAYOUT_TABLE_W_M = TABLE_W_M;
/** @deprecated Prefer TABLE_H_M from ortho-constants. */
export const LAYOUT_TABLE_H_M = TABLE_H_M;
/** @deprecated Prefer ORTHO_MARGIN from ortho-constants. */
export const LAYOUT_ORTHO_MARGIN = ORTHO_MARGIN;

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

  const [, rightF, topF] = orthoFrustum(aspect);
  const hw = rightF; // symmetric about 0
  const hh = topF;

  const widthFrac = TABLE_W_M / 2 / hw;
  const heightFrac = TABLE_H_M / 2 / hh;

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
