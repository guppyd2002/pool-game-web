/**
 * CUE-002: Power slider HTML overlay — browser UI wrapper for ShotSlider domain.
 *
 * Ports C# CueShotUIManager visual elements:
 *   slider       → <input type="range"> (horizontal, 0..100%)
 *   shotButton   → "Shot" button (manual mode only)
 *   cue image    → power percentage label
 *   indicator    → filled track colour (green→red with power)
 *
 * Positioned bottom-left to complement the spin disc (bottom-right).
 * Not unit-tested (DOM layer). All logic lives in game/shot-slider.ts.
 */

import type { ShotSlider } from '../game/shot-slider';

export interface PowerSliderUI {
  /** Sync slider track to current force fraction (e.g. from physics replay). */
  update(force: number): void;
  /** Called by CueController.resetForNewTurn(). */
  reset(): void;
  /** CUE-021: outer overlay element for opacity fade. */
  readonly element: HTMLElement;
  dispose(): void;
}

export function createPowerSliderUI(
  container: HTMLElement,
  slider: ShotSlider,
): PowerSliderUI {
  // ─── DOM structure ──────────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'bottom:20px', 'left:20px', 'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:flex-start', 'gap:8px',
    'background:rgba(0,0,0,0.5)', 'border:1px solid rgba(255,255,255,0.4)',
    'border-radius:8px', 'padding:10px 14px',
  ].join(';');

  // Power label + percentage
  const label = document.createElement('div');
  label.style.cssText = [
    'color:white', 'font-size:12px', 'font-family:sans-serif',
    'display:flex', 'justify-content:space-between', 'width:100%',
  ].join(';');
  const labelText = document.createElement('span');
  labelText.textContent = 'Power';
  const pctText = document.createElement('span');
  pctText.textContent = '0%';
  label.appendChild(labelText);
  label.appendChild(pctText);

  // Range slider
  const rangeInput = document.createElement('input');
  rangeInput.type = 'range';
  rangeInput.min = '0';
  rangeInput.max = '100';
  rangeInput.value = '0';
  rangeInput.style.cssText = [
    'width:160px', 'height:20px', 'cursor:pointer',
    'accent-color:hsl(120,80%,50%)',  // starts green; updated by JS
    'touch-action:none',
  ].join(';');

  // Shot button
  const shotBtn = document.createElement('button');
  shotBtn.textContent = 'Shot';
  shotBtn.style.cssText = [
    'width:100%', 'padding:6px 0', 'background:rgba(255,100,0,0.8)', 'color:white',
    'border:1px solid rgba(255,255,255,0.6)', 'border-radius:4px',
    'cursor:pointer', 'font-size:14px', 'font-weight:bold', 'touch-action:none',
  ].join(';');

  overlay.appendChild(label);
  overlay.appendChild(rangeInput);
  overlay.appendChild(shotBtn);
  container.appendChild(overlay);

  // ─── Visual sync ────────────────────────────────────────────────────────────

  function syncVisual(fraction: number): void {
    const pct = Math.round(fraction * 100);
    rangeInput.value = String(pct);
    pctText.textContent = `${pct}%`;
    // Green (low) → yellow → red (full), same ramp as power-bar.ts
    const r = Math.round(255 * Math.min(fraction * 2, 1));
    const g = Math.round(255 * Math.min((1 - fraction) * 2, 1));
    rangeInput.style.accentColor = `rgb(${r},${g},0)`;
  }

  // ─── Slider pointer events ──────────────────────────────────────────────────
  // Use pointerdown/pointermove/pointerup (not input/change) so we can track
  // startControl/endControl precisely, mirroring C# OnPointerDown / MouseInfo.Up.

  rangeInput.addEventListener('pointerdown', () => {
    slider.startControl();
    const fraction = Number(rangeInput.value) / 100;
    slider.setValue(fraction);
    syncVisual(fraction);
  });

  rangeInput.addEventListener('input', () => {
    const fraction = Number(rangeInput.value) / 100;
    slider.setValue(fraction);
    syncVisual(fraction);
  });

  rangeInput.addEventListener('pointerup', () => {
    slider.endControl();
  });

  // ─── Shot button ─────────────────────────────────────────────────────────────

  shotBtn.addEventListener('click', () => {
    slider.fire();
  });

  // ─── Public interface ────────────────────────────────────────────────────────

  return {
    get element() { return overlay; },

    update(force: number): void {
      syncVisual(Math.max(0, Math.min(1, force)));
    },

    reset(): void {
      slider.reset();
      syncVisual(0);
    },

    dispose(): void {
      container.removeChild(overlay);
    },
  };
}
