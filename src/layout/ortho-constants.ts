/**
 * Phase 1 Line A — single source for ortho table fit constants.
 *
 * Used by `scene.ts` (OrthoCamera frustum) and `felt-geometry.ts` (C4 / --felt-*).
 * CTO C-1: never fork ORTHO_MARGIN / TABLE_W/H between those two files.
 *
 * ORTHO_MARGIN 1.1365 = GLB full-table width 2.8866 m ÷ felt 2.54 m
 * (chief-architect 0-A measure): whole table (rails) flush to viewport; lower clips rails.
 * Do NOT change TABLE_W/H (physics / nose-to-nose). Do NOT import from src/physics/**.
 */

/** Cushion nose-to-nose length (m) — must stay 2.54. */
export const TABLE_W_M = 2.54;
/** Cushion nose-to-nose width (m) — must stay 1.27. */
export const TABLE_H_M = 1.27;

/**
 * Ortho frustum margin over nose-to-nose half-extents.
 * Was 1.28 (~78% height util); 1.1365 ≈ 88% with rails flush.
 */
export const ORTHO_MARGIN = 1.1365;

export const ORTHO_HALF_X = (TABLE_W_M / 2) * ORTHO_MARGIN;
export const ORTHO_HALF_Z = (TABLE_H_M / 2) * ORTHO_MARGIN;

/**
 * OrthographicCamera frustum [left, right, top, bottom] fitting the table
 * for the given viewport aspect (same branch as historical scene.ts).
 */
export function orthoFrustum(aspect: number): [number, number, number, number] {
  const tableAspect = ORTHO_HALF_X / ORTHO_HALF_Z;
  const hw = aspect >= tableAspect ? ORTHO_HALF_Z * aspect : ORTHO_HALF_X;
  const hh = aspect >= tableAspect ? ORTHO_HALF_Z : ORTHO_HALF_X / aspect;
  return [-hw, hw, hh, -hh];
}
