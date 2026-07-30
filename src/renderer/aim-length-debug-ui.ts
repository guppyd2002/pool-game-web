/**
 * SP-Harden-9 / 9c TEMP — on-screen slider for CEO live-tune of CUE AIM GUIDE length.
 *
 * Controls: hitLineBase family — primary aim/travel guide from the cue ball
 * along the shot direction (CEO "blue line"), NOT post-contact lineDistance arms.
 *
 * SP-Harden-9c: panel has close (X) + small "aim" reopen chip (mobile-friendly).
 * Does NOT touch computeAimLinePoints — only panel visibility.
 *
 * Units: meters along aim direction. Default 1.50 m. Range 0.10–3.00 m.
 */

import {
  getCueAimGuideLengthM,
  setCueAimGuideLengthM,
  DEFAULT_CUE_AIM_GUIDE_LENGTH_M,
} from './aim-line';

export interface AimLengthDebugUI {
  readonly element: HTMLElement;
  /** Show the full TEMP panel (hide reopen chip). */
  show(): void;
  /** Hide panel; show small reopen control. */
  hide(): void;
  dispose(): void;
}

/**
 * Floating TEMP panel + reopen chip.
 * Default panel visible for CEO mobile prod. Hide panel with X or ?debug=off (not created).
 */
export function createAimLengthDebugUI(
  container: HTMLElement,
  onChange?: (meters: number) => void,
): AimLengthDebugUI {
  // ── Full panel ────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'aim-length-debug';
  panel.style.cssText = [
    'position:absolute',
    'left:50%', 'transform:translateX(-50%)',
    'top:max(48px, calc(40px + env(safe-area-inset-top, 0px)))',
    'z-index:500',
    'background:rgba(12,18,28,0.92)',
    'border:1px solid rgba(77,184,255,0.65)',
    'border-radius:10px',
    'padding:8px 12px 10px',
    'min-width:min(92vw, 340px)',
    'font-family:system-ui,sans-serif',
    'color:#e8f7f8',
    'box-shadow:0 4px 18px rgba(0,0,0,0.55)',
    'pointer-events:auto',
    'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;';

  const titleLeft = document.createElement('span');
  titleLeft.style.cssText =
    'font-size:11px;font-weight:700;letter-spacing:0.4px;color:#4db8ff;';
  titleLeft.textContent = 'TEMP · cue aim guide (blue line)';

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

  const valueRow = document.createElement('div');
  valueRow.style.cssText =
    'display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:4px;';

  const valueEl = document.createElement('span');
  valueEl.style.cssText =
    'font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff;';
  valueEl.textContent = getCueAimGuideLengthM().toFixed(2);

  const unitEl = document.createElement('span');
  unitEl.style.cssText = 'font-size:12px;opacity:0.75;';
  unitEl.textContent = 'm';

  valueRow.appendChild(valueEl);
  valueRow.appendChild(unitEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.10';
  slider.max = '3.00';
  slider.step = '0.01';
  slider.value = String(getCueAimGuideLengthM());
  slider.style.cssText = [
    'width:100%', 'height:28px', 'margin:0',
    'accent-color:#4db8ff', 'cursor:pointer',
  ].join(';');
  slider.setAttribute('aria-label', 'Cue aim guide length meters');

  const hint = document.createElement('div');
  hint.style.cssText =
    'font-size:10px;opacity:0.65;margin-top:4px;text-align:center;line-height:1.35;';
  hint.innerHTML =
    `母球主瞄準線長度（可超過接觸點）<br>` +
    `default ${DEFAULT_CUE_AIM_GUIDE_LENGTH_M.toFixed(2)} m · 先瞄準再拖滑桿看藍線`;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = `Reset ${DEFAULT_CUE_AIM_GUIDE_LENGTH_M.toFixed(2)}`;
  resetBtn.style.cssText = [
    'margin-top:6px', 'width:100%',
    'background:rgba(255,255,255,0.08)', 'color:#cff',
    'border:1px solid rgba(255,255,255,0.2)', 'border-radius:6px',
    'padding:5px 8px', 'font-size:11px', 'cursor:pointer',
  ].join(';');

  function apply(v: number): void {
    const m = setCueAimGuideLengthM(v);
    valueEl.textContent = m.toFixed(2);
    slider.value = String(m);
    onChange?.(m);
  }

  slider.addEventListener('input', () => {
    apply(parseFloat(slider.value));
  });
  // stopPropagation so track clicks don't bubble oddly on mobile overlays
  slider.addEventListener('pointerdown', (e) => e.stopPropagation());
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    apply(DEFAULT_CUE_AIM_GUIDE_LENGTH_M);
  });

  panel.appendChild(title);
  panel.appendChild(valueRow);
  panel.appendChild(slider);
  panel.appendChild(hint);
  panel.appendChild(resetBtn);
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
    'border:1px solid rgba(77,184,255,0.7)',
    'background:rgba(12,18,28,0.9)',
    'color:#4db8ff',
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
