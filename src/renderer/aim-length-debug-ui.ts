/**
 * SP-Harden-9 TEMP — on-screen slider to live-tune aim assist lineDistance.
 * CEO picks a value on prod; then we bake the constant and remove this UI.
 *
 * Units: meters (same as SEPARATION_LINE_DEFAULT_LENGTH / Unity lineDistance).
 * Default 0.25 m. Range 0.05–1.5 m.
 */

import {
  getAimLineDistanceM,
  setAimLineDistanceM,
  SEPARATION_LINE_DEFAULT_LENGTH,
} from './ghost-ball';

export interface AimLengthDebugUI {
  readonly element: HTMLElement;
  dispose(): void;
}

/**
 * Create a floating TEMP panel. Always visible when created (CEO mobile-friendly).
 * Call only when debug mode is desired (main wires ?debug=aimlen or default-on).
 */
export function createAimLengthDebugUI(
  container: HTMLElement,
  onChange?: (meters: number) => void,
): AimLengthDebugUI {
  const panel = document.createElement('div');
  panel.id = 'aim-length-debug';
  panel.style.cssText = [
    'position:absolute',
    'left:50%', 'transform:translateX(-50%)',
    'top:max(48px, calc(40px + env(safe-area-inset-top, 0px)))',
    'z-index:500',
    'background:rgba(12,18,28,0.92)',
    'border:1px solid rgba(0,206,209,0.55)',
    'border-radius:10px',
    'padding:8px 12px 10px',
    'min-width:min(92vw, 320px)',
    'font-family:system-ui,sans-serif',
    'color:#e8f7f8',
    'box-shadow:0 4px 18px rgba(0,0,0,0.55)',
    'pointer-events:auto',
    'user-select:none',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;';
  title.innerHTML =
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.4px;color:#7ec8ff;">TEMP · aim lineDistance</span>' +
    '<span style="font-size:10px;opacity:0.65;">meters @ power=1</span>';

  const valueRow = document.createElement('div');
  valueRow.style.cssText =
    'display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:4px;';

  const valueEl = document.createElement('span');
  valueEl.style.cssText =
    'font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:#fff;';
  valueEl.textContent = getAimLineDistanceM().toFixed(2);

  const unitEl = document.createElement('span');
  unitEl.style.cssText = 'font-size:12px;opacity:0.75;';
  unitEl.textContent = 'm';

  valueRow.appendChild(valueEl);
  valueRow.appendChild(unitEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.05';
  slider.max = '1.50';
  slider.step = '0.01';
  slider.value = String(getAimLineDistanceM());
  slider.style.cssText = [
    'width:100%', 'height:28px', 'margin:0',
    'accent-color:#00ced1', 'cursor:pointer',
  ].join(';');
  slider.setAttribute('aria-label', 'Aim lineDistance meters');

  const hint = document.createElement('div');
  hint.style.cssText =
    'font-size:10px;opacity:0.6;margin-top:4px;text-align:center;';
  hint.textContent = `default ${SEPARATION_LINE_DEFAULT_LENGTH.toFixed(2)} m (Unity) · aim to preview`;

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset 0.25';
  resetBtn.style.cssText = [
    'margin-top:6px', 'width:100%',
    'background:rgba(255,255,255,0.08)', 'color:#cff',
    'border:1px solid rgba(255,255,255,0.2)', 'border-radius:6px',
    'padding:5px 8px', 'font-size:11px', 'cursor:pointer',
  ].join(';');

  function apply(v: number): void {
    const m = setAimLineDistanceM(v);
    valueEl.textContent = m.toFixed(2);
    slider.value = String(m);
    onChange?.(m);
  }

  slider.addEventListener('input', () => {
    apply(parseFloat(slider.value));
  });
  resetBtn.addEventListener('click', () => {
    apply(SEPARATION_LINE_DEFAULT_LENGTH);
  });

  panel.appendChild(title);
  panel.appendChild(valueRow);
  panel.appendChild(slider);
  panel.appendChild(hint);
  panel.appendChild(resetBtn);
  container.appendChild(panel);

  return {
    get element() {
      return panel;
    },
    dispose(): void {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
  };
}
