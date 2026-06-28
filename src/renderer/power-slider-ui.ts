/**
 * CUE-002 / 8BP: Power Bar UI — vertical bar on the right side of the screen.
 *
 * 8BP 分離式設計：
 *   - Drag UP to charge (touch anywhere on the track); release = fire.
 *   - isAutoShot: true in ShotSlider → endControl() fires automatically.
 *   - Positioned right side, between top-view/fine-aim buttons (top-right)
 *     and the spin disc (bottom-right) — no overlap on typical mobile screens.
 *
 * Not unit-tested (DOM layer). Domain logic lives in game/shot-slider.ts.
 */

import type { ShotSlider } from '../game/shot-slider';

export interface PowerSliderUI {
  /** Sync bar fill to current force fraction (e.g. from external update). */
  update(force: number): void;
  /** Reset visual to 0 (called on turn start or after shot). */
  reset(): void;
  /** CUE-021: outer overlay element for opacity fade and show/hide. */
  readonly element: HTMLElement;
  dispose(): void;
}

/** Height of the draggable track in CSS pixels. */
const TRACK_H = 180;

/** Width of the draggable track in CSS pixels. */
const TRACK_W = 36;

export function createPowerSliderUI(
  container: HTMLElement,
  slider: ShotSlider,
): PowerSliderUI {
  // ─── DOM structure ──────────────────────────────────────────────────────────

  // Outer wrapper — right side, vertically centred
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute', 'right:12px', 'top:50%', 'transform:translateY(-50%)',
    'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:6px',
    'user-select:none',
  ].join(';');

  // Label above the bar
  const label = document.createElement('div');
  label.textContent = 'POWER';
  label.style.cssText = [
    'color:rgba(255,255,255,0.7)', 'font-size:10px', 'font-family:sans-serif',
    'letter-spacing:1px', 'pointer-events:none',
  ].join(';');

  // Track container — captures pointer events for drag
  const track = document.createElement('div');
  track.style.cssText = [
    `width:${TRACK_W}px`, `height:${TRACK_H}px`, 'border-radius:18px',
    'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(255,255,255,0.3)',
    'position:relative', 'overflow:hidden',
    'touch-action:none', 'cursor:ns-resize',
  ].join(';');

  // Fill bar (bottom-up: low power = small fill, full power = full bar)
  const fill = document.createElement('div');
  fill.style.cssText = [
    'position:absolute', 'bottom:0', 'left:0', 'right:0',
    'height:0%',
    // Green at bottom → yellow → red at top (matches 8BP convention)
    'background:linear-gradient(to top,#44ff44,#ffcc00,#ff4444)',
    'border-radius:16px',
  ].join(';');

  track.appendChild(fill);

  // Percentage readout below the bar
  const pctText = document.createElement('div');
  pctText.textContent = '0%';
  pctText.style.cssText = [
    'color:white', 'font-size:11px', 'font-family:sans-serif',
    'font-weight:bold', 'pointer-events:none',
  ].join(';');

  // Hint text
  const hint = document.createElement('div');
  hint.textContent = '↑ Drag';
  hint.style.cssText = [
    'color:rgba(255,255,255,0.45)', 'font-size:9px', 'font-family:sans-serif',
    'pointer-events:none', 'text-align:center',
  ].join(';');

  overlay.appendChild(label);
  overlay.appendChild(track);
  overlay.appendChild(pctText);
  overlay.appendChild(hint);
  container.appendChild(overlay);

  // ─── Visual sync ────────────────────────────────────────────────────────────

  function syncVisual(fraction: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    fill.style.height = `${pct}%`;
    pctText.textContent = `${pct}%`;
  }

  // ─── Coordinate → force fraction ────────────────────────────────────────────

  function clientYToFraction(clientY: number): number {
    const rect = track.getBoundingClientRect();
    // Top of track = full power (1.0), bottom = zero (0.0)
    return 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }

  // ─── Pointer events on the track ────────────────────────────────────────────

  track.addEventListener('pointerdown', (e: PointerEvent) => {
    track.setPointerCapture(e.pointerId);
    const f = clientYToFraction(e.clientY);
    slider.startControl();
    slider.setValue(f);
    syncVisual(f);
    e.preventDefault();
    e.stopPropagation();  // don't bubble to canvas aim-drag handler
  });

  track.addEventListener('pointermove', (e: PointerEvent) => {
    if (!slider.isSelected) return;
    const f = clientYToFraction(e.clientY);
    slider.setValue(f);
    syncVisual(f);
    e.preventDefault();
  });

  track.addEventListener('pointerup', (_e: PointerEvent) => {
    if (!slider.isSelected) return;
    slider.endControl();  // isAutoShot=true → fires if force > minForce
    syncVisual(0);        // reset fill immediately after release
  });

  track.addEventListener('pointercancel', (_e: PointerEvent) => {
    if (slider.isSelected) {
      slider.disable();  // cancel if pointer stolen
      syncVisual(0);
    }
  });

  // ─── Public interface ────────────────────────────────────────────────────────

  return {
    get element() { return overlay; },

    update(force: number): void {
      syncVisual(force);
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
