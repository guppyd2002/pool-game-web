/**
 * CUE-002 / 8BP: Power Bar UI — vertical bar on the right side of the screen.
 *
 * 8BP 分離式設計：
 *   - F-②: Drag DOWN to charge (cue-pull metaphor); release = fire.
 *   - isAutoShot: true in ShotSlider → endControl() fires automatically.
 *   - F-①: Positioned right side with safe-area-inset-right margin to avoid
 *     toolbar/notch overlap, between top-view/fine-aim buttons (top-right)
 *     and the spin disc (bottom-right).
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

/** Height of the draggable track in CSS pixels. Landscape spec: 240dp. */
const TRACK_H = 240;

/** Width of the draggable track in CSS pixels. Landscape spec: 48dp. */
const TRACK_W = 48;

export function createPowerSliderUI(
  container: HTMLElement,
  slider: ShotSlider,
): PowerSliderUI {
  // ─── DOM structure ──────────────────────────────────────────────────────────

  // Outer wrapper — right side, vertically centred.
  // right uses max() so safe-area-inset-right (landscape notch) is respected.
  // CSS class name used by left-hand-mode override in index.html.
  const overlay = document.createElement('div');
  overlay.className = 'power-slider-overlay';
  overlay.style.cssText = [
    'position:absolute',
    'right:max(16px, calc(16px + env(safe-area-inset-right, 0px)))',
    'top:50%', 'transform:translateY(-50%)',
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
    // G-1: raised opacity + stronger border so track is visible on dark table bg (#1a1a2e)
    'background:rgba(0,0,0,0.88)', 'border:2px solid rgba(255,255,255,0.65)',
    'box-shadow:0 0 0 1px rgba(255,255,255,0.15),0 4px 20px rgba(0,0,0,0.9)',
    'position:relative', 'overflow:hidden',
    'touch-action:none', 'cursor:ns-resize',
  ].join(';');

  // F-②: Fill bar — top-anchored (cue-pull metaphor: drag DOWN = more power shown from top).
  // Thumb shows current drag position; fill below thumb shows accumulated pullback.
  const fill = document.createElement('div');
  fill.style.cssText = [
    'position:absolute', 'top:0', 'left:0', 'right:0',
    'height:0%',
    // Weak (green) at top → strong (red) at bottom (charge level as cue is pulled further down)
    'background:linear-gradient(to bottom,#44ff44,#ffcc00,#ff4444)',
    'border-radius:16px',
  ].join(';');

  // Thumb indicator — moves down as power increases (start at top = 0 force)
  const thumb = document.createElement('div');
  thumb.style.cssText = [
    'position:absolute', 'top:0', 'left:2px', 'right:2px', 'height:16px',
    'background:rgba(255,255,255,0.85)', 'border-radius:8px',
    'transition:top 0.05s linear',
    'pointer-events:none',
  ].join(';');

  track.appendChild(fill);
  track.appendChild(thumb);

  // Percentage readout below the bar
  const pctText = document.createElement('div');
  pctText.textContent = '0%';
  pctText.style.cssText = [
    'color:white', 'font-size:11px', 'font-family:sans-serif',
    'font-weight:bold', 'pointer-events:none',
  ].join(';');

  // Hint text — cue-pull metaphor (landscape: pull down = power, release = shoot)
  const hint = document.createElement('div');
  hint.textContent = '↓ Pull = Power';
  hint.style.cssText = [
    'color:rgba(255,255,255,0.45)', 'font-size:9px', 'font-family:sans-serif',
    'pointer-events:none', 'text-align:center',
  ].join(';');

  const hint2 = document.createElement('div');
  hint2.textContent = 'Release = Shoot';
  hint2.style.cssText = [
    'color:rgba(255,255,255,0.35)', 'font-size:8px', 'font-family:sans-serif',
    'pointer-events:none', 'text-align:center',
  ].join(';');

  overlay.appendChild(label);
  overlay.appendChild(track);
  overlay.appendChild(pctText);
  overlay.appendChild(hint);
  overlay.appendChild(hint2);
  container.appendChild(overlay);

  // ─── Visual sync ────────────────────────────────────────────────────────────

  const THUMB_H = 16;

  function syncVisual(fraction: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    // F-②: fill grows from top (more pull = more fill from top)
    fill.style.height = `${pct}%`;
    // Thumb tracks drag position (top = 0, bottom = full power)
    const thumbTop = fraction * (TRACK_H - THUMB_H);
    thumb.style.top = `${thumbTop}px`;
    pctText.textContent = `${pct}%`;
  }

  // ─── Coordinate → force fraction ────────────────────────────────────────────

  function clientYToFraction(clientY: number): number {
    const rect = track.getBoundingClientRect();
    // F-②: DOWN = charge (cue-pull metaphor). Top = 0 force, bottom = full force.
    // bit-exact neutral: only mapping direction changes, trunc(f*MAX_FORCE) unchanged.
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
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
