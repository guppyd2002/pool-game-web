/**
 * CUE-006/CUE-008: SpinDisc HTML overlay — browser UI wrapper for SpinDisc domain.
 *
 * CUE-008: "Spin" open button (openButton in C# CueTargetingUIManager).
 * CUE-006: Targeting disc circle + drag dot (targetingPanel + hitPoint in C#).
 *
 * Not unit-tested (DOM layer). All spin math lives in game/spin-disc.ts.
 */

import type { SpinDisc } from '../game/spin-disc';

/** Visual radius of the disc in CSS pixels. */
const DISC_RADIUS = 60;

/** Spin dot half-size. */
const DOT_R = 8;

/**
 * C# koeficient = 0.7: limits max spin to 70% of disc radius.
 * Applied to INPUT (toNormalized multiplies coords by KOEFICIENT) so domain spinX ∈ [-0.7, 0.7].
 * VISUAL_SCALE = 1.0 because koeficient is already baked into the spin value;
 * net dot offset = spinX * DISC_RADIUS * 1.0 = 0.7 * 60 = 42px = 70% of radius ✓
 */
const KOEFICIENT = 0.7;
const VISUAL_SCALE = 1.0;

export interface SpinDiscUI {
  /** Two-finger interrupt or programmatic close. */
  close(): void;
  /** Called by CueController.resetForNewTurn(). */
  reset(): void;
  dispose(): void;
}

export function createSpinDiscUI(container: HTMLElement, disc: SpinDisc): SpinDiscUI {
  // ─── DOM structure ──────────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px', 'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:8px',
  ].join(';');

  // CUE-008: open button
  const btn = document.createElement('button');
  btn.textContent = 'Spin';
  btn.style.cssText = [
    'padding:8px 16px', 'background:rgba(0,0,0,0.6)', 'color:white',
    'border:1px solid rgba(255,255,255,0.7)', 'border-radius:4px',
    'cursor:pointer', 'font-size:14px', 'touch-action:none',
  ].join(';');

  // Targeting disc panel
  const D = DISC_RADIUS * 2;
  const panel = document.createElement('div');
  panel.style.cssText = [
    `width:${D}px`, `height:${D}px`, 'border-radius:50%',
    'border:2px solid rgba(255,255,255,0.7)', 'background:rgba(0,0,0,0.5)',
    'position:relative', 'display:none', 'touch-action:none', 'user-select:none',
  ].join(';');

  // Crosshair guides (cosmetic)
  const hline = document.createElement('div');
  hline.style.cssText = `position:absolute;top:50%;left:10%;width:80%;height:1px;background:rgba(255,255,255,0.2);transform:translateY(-50%);pointer-events:none;`;
  const vline = document.createElement('div');
  vline.style.cssText = `position:absolute;left:50%;top:10%;height:80%;width:1px;background:rgba(255,255,255,0.2);transform:translateX(-50%);pointer-events:none;`;

  // Spin dot (shows current spin position)
  const dot = document.createElement('div');
  dot.style.cssText = [
    `position:absolute`, `width:${DOT_R * 2}px`, `height:${DOT_R * 2}px`,
    'border-radius:50%', 'background:white', 'opacity:0.9',
    'transform:translate(-50%,-50%)', 'pointer-events:none',
  ].join(';');

  panel.appendChild(hline);
  panel.appendChild(vline);
  panel.appendChild(dot);
  overlay.appendChild(btn);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // ─── Dot position sync ──────────────────────────────────────────────────────

  function syncDot(): void {
    // Map spin [-1,1] to pixel offset. Scale by VISUAL_SCALE to match C# koeficient.
    const cx = DISC_RADIUS + disc.spinX * DISC_RADIUS * VISUAL_SCALE;
    const cy = DISC_RADIUS - disc.spinY * DISC_RADIUS * VISUAL_SCALE;  // Y flipped (up = positive)
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
  }
  syncDot();

  // ─── Panel open/close ───────────────────────────────────────────────────────

  function showPanel(): void { panel.style.display = 'block'; syncDot(); }
  function hidePanel(): void { panel.style.display = 'none'; }

  // CUE-008: open button click
  btn.addEventListener('click', () => {
    disc.open();
    showPanel();
  });

  // ─── Pointer coordinate conversion ─────────────────────────────────────────

  function toNormalized(clientX: number, clientY: number): { nx: number; ny: number } {
    const rect = panel.getBoundingClientRect();
    const cx = rect.left + DISC_RADIUS, cy = rect.top + DISC_RADIUS;
    // Multiply by KOEFICIENT so full-rim drag → spin = 0.7 (matching C# displacement = normalizedPos * koeficient).
    return {
      nx:  (clientX - cx) / DISC_RADIUS * KOEFICIENT,
      ny: -(clientY - cy) / DISC_RADIUS * KOEFICIENT,  // Y flipped: screen-down = game-back
    };
  }

  // ─── Disc pointer events ────────────────────────────────────────────────────

  panel.addEventListener('pointerdown', (e: PointerEvent) => {
    const { nx, ny } = toNormalized(e.clientX, e.clientY);
    const hit = disc.pointerDown(nx, ny);
    if (hit) {
      syncDot();
      panel.setPointerCapture(e.pointerId);
    } else {
      hidePanel();  // miss → disc already closed by domain
    }
    e.preventDefault();
  });

  panel.addEventListener('pointermove', (e: PointerEvent) => {
    if (!disc.isDragging) return;
    const { nx, ny } = toNormalized(e.clientX, e.clientY);
    disc.pointerMove(nx, ny);
    syncDot();
    e.preventDefault();
  });

  panel.addEventListener('pointerup', (e: PointerEvent) => {
    if (disc.isDragging) {
      disc.pointerUp();
      hidePanel();  // pointerUp closes disc
    }
    e.preventDefault();
  });

  // ─── Public interface ───────────────────────────────────────────────────────

  return {
    close(): void {
      disc.close();
      hidePanel();
    },

    reset(): void {
      disc.reset();
      hidePanel();
      syncDot();
    },

    dispose(): void {
      container.removeChild(overlay);
    },
  };
}
