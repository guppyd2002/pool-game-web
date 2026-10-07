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
import {
  GUTTER_INNER_PAD_PX,
  POWER_TRACK_W_NATURAL,
  powerTrackWidthFromGutter,
  readCssPxVar,
} from '../layout/gutter-control-size';

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

export function createPowerSliderUI(
  container: HTMLElement,
  slider: ShotSlider,
): PowerSliderUI {
  // ─── DOM structure ──────────────────────────────────────────────────────────

  // Outer wrapper — Phase 1 #4/#F-2b-5: position in gutter; size lives on the track child.
  // Do NOT use max-width/overflow on the wrapper as a layout clamp (clips T-target).
  const overlay = document.createElement('div');
  overlay.className = 'power-slider-overlay';
  overlay.setAttribute('aria-label', 'Shot power');
  overlay.style.cssText = [
    'position:absolute',
    'left:calc(var(--felt-left, 0px) + var(--felt-width, 100%) + 4px)',
    'right:auto',
    'top:50%', 'transform:translateY(-50%)',
    'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:4px',
    'user-select:none',
    'opacity:0.28',
    'transition:opacity 0.15s ease-out',
  ].join(';');

  // Explicit legend — Kakashi smoke: unlabeled right strip was mistaken for spin.
  const label = document.createElement('div');
  label.className = 'hud-side-label';
  label.textContent = 'POWER';
  label.style.cssText = [
    'color:rgba(255,255,255,0.92)', 'font-size:11px', 'font-family:sans-serif',
    'font-weight:bold', 'letter-spacing:1.5px', 'pointer-events:none',
    'text-shadow:0 1px 3px rgba(0,0,0,0.9)',
  ].join(';');

  // Track — width from --gutter-right (F-2b-5); overflow:hidden only for fill paint.
  const track = document.createElement('div');
  track.style.cssText = [
    `width:${POWER_TRACK_W_NATURAL}px`, `height:${TRACK_H}px`, 'border-radius:18px',
    'background:rgba(0,0,0,0.50)', 'border:2px solid rgba(255,255,255,0.55)',
    'box-shadow:0 0 0 1px rgba(255,255,255,0.10),0 4px 16px rgba(0,0,0,0.6)',
    'position:relative', 'overflow:hidden',
    'touch-action:none', 'cursor:ns-resize',
  ].join(';');

  function applyGutterWidth(): void {
    // Left-hand mode swaps to left gutter via CSS class on #app.
    const leftHand = container.classList.contains('left-hand-mode');
    const gutter = readCssPxVar(
      container,
      leftHand ? '--gutter-left' : '--gutter-right',
      // Natural + pad: first paint before --gutter-* publish must not be 0px.
      POWER_TRACK_W_NATURAL + GUTTER_INNER_PAD_PX,
    );
    const w = powerTrackWidthFromGutter(gutter);
    track.style.width = `${w}px`;
  }
  applyGutterWidth();
  window.addEventListener('resize', applyGutterWidth);
  window.visualViewport?.addEventListener('resize', applyGutterWidth);
  const classMo = new MutationObserver(() => applyGutterWidth());
  classMo.observe(container, { attributes: true, attributeFilter: ['class'] });

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
    overlay.style.opacity = '0.9';  // active state: full opacity
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
    syncVisual(0);
    overlay.style.opacity = '0.4';  // return to idle opacity
  });

  track.addEventListener('pointercancel', (_e: PointerEvent) => {
    if (slider.isSelected) {
      slider.disable();  // cancel if pointer stolen
      syncVisual(0);
    }
    overlay.style.opacity = '0.4';
  });

  // ─── Public interface ────────────────────────────────────────────────────────

  return {
    get element() { return overlay; },

    update(force: number): void {
      syncVisual(force);
    },

    reset(): void {
      // slider.reset() restores defaultForce (0.5 in UX mode); sync visual to match.
      slider.reset();
      syncVisual(slider.force);
    },

    dispose(): void {
      window.removeEventListener('resize', applyGutterWidth);
      window.visualViewport?.removeEventListener('resize', applyGutterWidth);
      classMo.disconnect();
      overlay.remove();
    },
  };
}
