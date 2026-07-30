/**
 * SP-Harden-9d TEMP — dual on-screen sliders for CEO live-tune of BOTH aim arms.
 *
 * Slider A (PRIMARY — CEO clarified): 目標球延伸線 (target extension)
 *   → ghost-ball.ts `_lineDistanceM` / setAimLineDistanceM
 *   → red/cyan post-contact line-of-centers arms (deflect + target)
 *   → arm actual length also scales with power(energy01) and cut angle kk:
 *       s_target = clamp01(1.5*kk)*lineLen + 2R
 *     Slider sets the baseline lineLen (shown as「基準」).
 *
 * Slider B: 母球導引線 (cue guide)
 *   → setCueAimGuideLengthM (blue line, 6256539 computeAimLinePoints — DO NOT touch)
 *
 * SP-Harden-9c UX retained: ✕ close panel + small "aim" reopen chip.
 * Pure UI/debug — no physics / rules changes.
 */

import {
  getCueAimGuideLengthM,
  setCueAimGuideLengthM,
  DEFAULT_CUE_AIM_GUIDE_LENGTH_M,
  CUE_AIM_GUIDE_MIN_M,
  CUE_AIM_GUIDE_MAX_M,
} from './aim-line';
import {
  getAimLineDistanceM,
  setAimLineDistanceM,
  SEPARATION_LINE_DEFAULT_LENGTH,
  AIM_LINE_DISTANCE_MIN_M,
  AIM_LINE_DISTANCE_MAX_M,
} from './ghost-ball';

export interface AimLengthDebugUI {
  readonly element: HTMLElement;
  /** Show the full TEMP panel (hide reopen chip). */
  show(): void;
  /** Hide panel; show small reopen control. */
  hide(): void;
  dispose(): void;
}

const COLOR_TARGET = '#ff5555'; // red/cyan post-contact arms (illegal red; legal cyan ~#7ec8ff)
const COLOR_TARGET_ALT = '#7ec8ff';
const COLOR_CUE = '#4db8ff'; // blue cue aim guide

function makeSwatch(color: string, title: string): HTMLElement {
  const s = document.createElement('span');
  s.title = title;
  s.style.cssText = [
    'display:inline-block',
    'width:12px', 'height:12px',
    'border-radius:3px',
    `background:${color}`,
    'border:1px solid rgba(255,255,255,0.45)',
    'flex:0 0 auto',
    'box-shadow:0 0 0 1px rgba(0,0,0,0.35)',
  ].join(';');
  return s;
}

function makeSliderRow(opts: {
  id: string;
  label: string;
  swatchColors: string[];
  swatchTitle: string;
  min: number;
  max: number;
  step: number;
  getValue: () => number;
  setValue: (v: number) => number;
  defaultValue: number;
  accent: string;
  valueSuffix: string;
  hint: string;
  onChange?: () => void;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:10px;';

  const labelRow = document.createElement('div');
  labelRow.style.cssText =
    'display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;';

  for (const c of opts.swatchColors) {
    labelRow.appendChild(makeSwatch(c, opts.swatchTitle));
  }

  const labelEl = document.createElement('span');
  labelEl.style.cssText =
    'font-size:11px;font-weight:700;letter-spacing:0.2px;color:#e8f7f8;';
  labelEl.textContent = opts.label;
  labelRow.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.style.cssText =
    'margin-left:auto;font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff;';
  valueEl.textContent = `${opts.getValue().toFixed(2)}${opts.valueSuffix}`;
  labelRow.appendChild(valueEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = opts.id;
  slider.min = String(opts.min);
  slider.max = String(opts.max);
  slider.step = String(opts.step);
  slider.value = String(opts.getValue());
  slider.style.cssText = [
    'width:100%', 'height:28px', 'margin:0',
    `accent-color:${opts.accent}`, 'cursor:pointer',
  ].join(';');
  slider.setAttribute('aria-label', opts.label);

  const hint = document.createElement('div');
  hint.style.cssText =
    'font-size:9px;opacity:0.7;margin-top:2px;line-height:1.3;color:#cde;';
  hint.textContent = opts.hint;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = `Reset ${opts.defaultValue.toFixed(2)}`;
  resetBtn.style.cssText = [
    'margin-top:4px', 'width:100%',
    'background:rgba(255,255,255,0.06)', 'color:#cff',
    'border:1px solid rgba(255,255,255,0.15)', 'border-radius:5px',
    'padding:3px 6px', 'font-size:10px', 'cursor:pointer',
  ].join(';');

  function apply(v: number): void {
    const m = opts.setValue(v);
    valueEl.textContent = `${m.toFixed(2)}${opts.valueSuffix}`;
    slider.value = String(m);
    opts.onChange?.();
  }

  slider.addEventListener('input', () => {
    apply(parseFloat(slider.value));
  });
  slider.addEventListener('pointerdown', (e) => e.stopPropagation());
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    apply(opts.defaultValue);
  });

  wrap.appendChild(labelRow);
  wrap.appendChild(slider);
  wrap.appendChild(hint);
  wrap.appendChild(resetBtn);
  return wrap;
}

/**
 * Floating TEMP dual-slider panel + reopen chip.
 * Default panel visible for CEO mobile prod. Hide panel with X or ?debug=off (not created).
 */
export function createAimLengthDebugUI(
  container: HTMLElement,
  onChange?: () => void,
): AimLengthDebugUI {
  // ── Full panel ────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'aim-length-debug';
  panel.style.cssText = [
    'position:absolute',
    'left:50%', 'transform:translateX(-50%)',
    'top:max(48px, calc(40px + env(safe-area-inset-top, 0px)))',
    'z-index:500',
    'background:rgba(12,18,28,0.94)',
    'border:1px solid rgba(255,120,100,0.55)',
    'border-radius:10px',
    'padding:8px 12px 8px',
    'min-width:min(94vw, 360px)',
    'font-family:system-ui,sans-serif',
    'color:#e8f7f8',
    'box-shadow:0 4px 18px rgba(0,0,0,0.55)',
    'pointer-events:auto',
    'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;';

  const titleLeft = document.createElement('span');
  titleLeft.style.cssText =
    'font-size:11px;font-weight:700;letter-spacing:0.4px;color:#ffaa88;';
  titleLeft.textContent = 'TEMP · dual aim lengths (9d)';

  // SP-Harden-9c: obvious close control for mobile (no query-string needed).
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close aim length panel');
  closeBtn.title = 'Close panel';
  closeBtn.style.cssText = [
    'flex:0 0 auto',
    'width:32px', 'height:32px',
    'border-radius:8px',
    'border:1px solid rgba(255,255,255,0.35)',
    'background:rgba(255,80,80,0.25)',
    'color:#fff',
    'font-size:16px', 'font-weight:700', 'line-height:1',
    'cursor:pointer',
    'padding:0',
    'display:flex', 'align-items:center', 'justify-content:center',
  ].join(';');

  title.appendChild(titleLeft);
  title.appendChild(closeBtn);
  panel.appendChild(title);

  // ── Slider A: target extension (PRIMARY — CEO) ────────────────────────────
  // Gate ⑤: min/max === AIM_LINE_DISTANCE_MIN/MAX (same as setAimLineDistanceM).
  // Trap ③: only visible when hitType==='ball'. Trap ④: actual arm scales power×kk.
  const rowA = makeSliderRow({
    id: 'aim-len-target-ext',
    label: 'A 目標球延伸線 (target extension)',
    swatchColors: [COLOR_TARGET, COLOR_TARGET_ALT],
    swatchTitle: 'Post-contact arms (red illegal / cyan legal)',
    min: AIM_LINE_DISTANCE_MIN_M,
    max: AIM_LINE_DISTANCE_MAX_M,
    step: 0.01,
    getValue: getAimLineDistanceM,
    setValue: setAimLineDistanceM,
    defaultValue: SEPARATION_LINE_DEFAULT_LENGTH,
    accent: COLOR_TARGET,
    valueSuffix: ' m 基準長度',
    hint:
      '基準長度（實際受力道/切角影響）s=clamp01(1.5·kk)·lineLen+2R。' +
      '測 A 必瞄球+高 power；空桌無紅線。拖 A→紅/青臂動、藍線不動。',
    onChange,
  });
  panel.appendChild(rowA);

  // Divider
  const div = document.createElement('div');
  div.style.cssText =
    'height:1px;background:rgba(255,255,255,0.12);margin:2px 0 8px;';
  panel.appendChild(div);

  // ── Slider B: cue aim guide (blue, 6256539 locked) ─────────────────────────
  // Gate ⑤: min/max === CUE_AIM_GUIDE_MIN/MAX (same as setCueAimGuideLengthM).
  const rowB = makeSliderRow({
    id: 'aim-len-cue-guide',
    label: 'B 母球導引線 (cue guide)',
    swatchColors: [COLOR_CUE],
    swatchTitle: 'Cue ball blue aim guide',
    min: CUE_AIM_GUIDE_MIN_M,
    max: CUE_AIM_GUIDE_MAX_M,
    step: 0.01,
    getValue: getCueAimGuideLengthM,
    setValue: setCueAimGuideLengthM,
    defaultValue: DEFAULT_CUE_AIM_GUIDE_LENGTH_M,
    accent: COLOR_CUE,
    valueSuffix: ' m',
    hint:
      '母球藍線（可超過接觸點；空桌也有）。6256539 邏輯不動。拖 B→藍線動、紅/青臂不動。',
    onChange,
  });
  panel.appendChild(rowB);

  container.appendChild(panel);

  // ── Reopen chip (shown when panel hidden) ─────────────────────────────────
  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.id = 'aim-length-debug-reopen';
  reopen.textContent = 'aim';
  reopen.title = 'Reopen aim length panel';
  reopen.setAttribute('aria-label', 'Reopen aim length panel');
  reopen.style.cssText = [
    'position:absolute',
    'right:max(8px, env(safe-area-inset-right, 0px))',
    'top:max(48px, calc(40px + env(safe-area-inset-top, 0px)))',
    'z-index:500',
    'display:none',
    'min-width:44px', 'min-height:36px',
    'padding:6px 12px',
    'border-radius:18px',
    'border:1px solid rgba(255,120,100,0.7)',
    'background:rgba(12,18,28,0.9)',
    'color:#ffaa88',
    'font-size:12px', 'font-weight:700',
    'font-family:system-ui,sans-serif',
    'cursor:pointer',
    'box-shadow:0 2px 10px rgba(0,0,0,0.45)',
    'pointer-events:auto',
  ].join(';');
  container.appendChild(reopen);

  function show(): void {
    panel.style.display = 'block';
    reopen.style.display = 'none';
  }

  function hide(): void {
    panel.style.display = 'none';
    reopen.style.display = 'block';
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hide();
  });
  reopen.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    show();
  });

  return {
    get element() {
      return panel;
    },
    show,
    hide,
    dispose(): void {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
      if (reopen.parentNode) reopen.parentNode.removeChild(reopen);
    },
  };
}
