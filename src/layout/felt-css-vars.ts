/**
 * Phase 1 #4 — runtime --felt-* / --gutter-* CSS variables from computeFeltScreenRect.
 * No hardcoded gutter pixels (281/40 forbidden).
 */
import type { FeltScreenRect } from './felt-geometry';
import { computeFeltScreenRect } from './felt-geometry';

export const FELT_CSS_VAR_NAMES = [
  '--felt-left',
  '--felt-top',
  '--felt-right',
  '--felt-bottom',
  '--felt-width',
  '--felt-height',
  '--gutter-left',
  '--gutter-right',
  '--gutter-top',
  '--gutter-bottom',
] as const;

export type FeltCssInvariantResult = {
  ok: boolean;
  /** Soft red flag for probe / CI messaging. */
  red: boolean;
  errors: string[];
};

/**
 * C4 invariant: felt rect must lie inside the view box; gutters non-negative.
 * When violated → red=true (CI assertable).
 */
export function checkFeltCssInvariant(
  felt: FeltScreenRect,
  viewWidth: number,
  viewHeight: number,
  eps = 0.5,
): FeltCssInvariantResult {
  const errors: string[] = [];
  const w = Math.max(1, viewWidth);
  const h = Math.max(1, viewHeight);

  if (felt.left < -eps) errors.push(`felt.left ${felt.left} < 0`);
  if (felt.top < -eps) errors.push(`felt.top ${felt.top} < 0`);
  if (felt.width < -eps) errors.push(`felt.width ${felt.width} < 0`);
  if (felt.height < -eps) errors.push(`felt.height ${felt.height} < 0`);
  if (felt.left + felt.width > w + eps) {
    errors.push(`felt right ${felt.left + felt.width} > viewW ${w}`);
  }
  if (felt.top + felt.height > h + eps) {
    errors.push(`felt bottom ${felt.top + felt.height} > viewH ${h}`);
  }
  if (felt.gutterLeft < -eps) errors.push(`gutterLeft ${felt.gutterLeft} < 0`);
  if (felt.gutterRight < -eps) errors.push(`gutterRight ${felt.gutterRight} < 0`);
  if (felt.gutterTop < -eps) errors.push(`gutterTop ${felt.gutterTop} < 0`);
  if (felt.gutterBottom < -eps) errors.push(`gutterBottom ${felt.gutterBottom} < 0`);

  const ok = errors.length === 0;
  return { ok, red: !ok, errors };
}

/** Write runtime CSS vars onto `el` (typically #app or :root). */
export function applyFeltCssVars(
  el: HTMLElement,
  viewWidth: number,
  viewHeight: number,
): { felt: FeltScreenRect; invariant: FeltCssInvariantResult } {
  const felt = computeFeltScreenRect(viewWidth, viewHeight);
  const invariant = checkFeltCssInvariant(felt, viewWidth, viewHeight);
  const style = el.style;
  style.setProperty('--felt-left', `${felt.left}px`);
  style.setProperty('--felt-top', `${felt.top}px`);
  style.setProperty('--felt-right', `${felt.gutterRight}px`);
  style.setProperty('--felt-bottom', `${felt.gutterBottom}px`);
  style.setProperty('--felt-width', `${felt.width}px`);
  style.setProperty('--felt-height', `${felt.height}px`);
  style.setProperty('--gutter-left', `${felt.gutterLeft}px`);
  style.setProperty('--gutter-right', `${felt.gutterRight}px`);
  style.setProperty('--gutter-top', `${felt.gutterTop}px`);
  style.setProperty('--gutter-bottom', `${felt.gutterBottom}px`);
  if (invariant.red) {
    el.dataset.feltInvariant = 'red';
  } else {
    el.dataset.feltInvariant = 'ok';
  }
  return { felt, invariant };
}

/**
 * Install resize listeners that keep CSS vars in sync with the container box.
 * Uses getBoundingClientRect — no hardcoded gutter pixels.
 */
export function installFeltCssVars(
  container: HTMLElement,
  opts?: { onUpdate?: (felt: FeltScreenRect, inv: FeltCssInvariantResult) => void },
): { update(): void; dispose(): void } {
  const update = (): void => {
    const r = container.getBoundingClientRect();
    const { felt, invariant } = applyFeltCssVars(container, r.width, r.height);
    opts?.onUpdate?.(felt, invariant);
  };
  update();
  window.addEventListener('resize', update);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  return {
    update,
    dispose(): void {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    },
  };
}
