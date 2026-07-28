/**
 * CUE-006/CUE-008: SpinDisc HTML overlay — browser UI wrapper for SpinDisc domain.
 *
 * Landscape layout:
 *   - Left side, vertically centred (left-hand mode: right side via CSS class).
 *   - Collapsed: 68×68dp circular cueball button.
 *   - Expanded: 130×130dp disc with crosshair + draggable red dot.
 *   - Auto-closes after 2s idle or on next table tap.
 *   - Expand/collapse animation: 150ms ease-out.
 *
 * Not unit-tested (DOM layer). All spin math lives in game/spin-disc.ts.
 */

import type { SpinDisc } from '../game/spin-disc';

/** Visual radius of the disc in CSS pixels. */
const DISC_RADIUS = 65;

/** Spin dot half-size. */
const DOT_R = 9;

/** Auto-close timeout after last pointer interaction (ms). */
const AUTO_CLOSE_MS = 2000;

/**
 * C# koeficient = 0.7: limits max spin to 70% of disc radius.
 */
const KOEFICIENT = 0.7;
const VISUAL_SCALE = 1.0;

export interface SpinDiscUI {
  close(): void;
  reset(): void;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createSpinDiscUI(container: HTMLElement, disc: SpinDisc): SpinDiscUI {
  let _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── DOM structure ──────────────────────────────────────────────────────────

  // Overlay on table left edge — semi-transparent, opacity transitions on interaction.
  // CSS class spin-disc-overlay used by left-hand-mode override in index.html.
  const overlay = document.createElement('div');
  overlay.className = 'spin-disc-overlay';
  overlay.style.cssText = [
    'position:absolute',
    'left:max(12px, calc(12px + env(safe-area-inset-left, 0px)))',
    'top:50%', 'transform:translateY(-50%)',
    'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:8px',
    'user-select:none',
    'opacity:0.4',
    'transition:opacity 0.15s ease-out',
  ].join(';');

  // Legend label (SP-Harden-3) — makes english control self-describing.
  const spinLabel = document.createElement('div');
  spinLabel.className = 'hud-side-label';
  spinLabel.textContent = 'SPIN';
  spinLabel.style.cssText = [
    'color:rgba(255,255,255,0.92)', 'font-size:11px', 'font-family:sans-serif',
    'font-weight:bold', 'letter-spacing:1.5px', 'pointer-events:none',
    'text-shadow:0 1px 3px rgba(0,0,0,0.9)',
  ].join(';');

  // Collapsed button — 68×68dp circle showing cueball icon
  const btn = document.createElement('button');
  btn.title = 'Spin / English';
  btn.setAttribute('aria-label', 'Cue ball spin');
  btn.style.cssText = [
    'width:68px', 'height:68px', 'border-radius:50%',
    'background:rgba(28,36,48,0.92)',
    'border:2px solid rgba(255,255,255,0.35)',
    'box-shadow:0 2px 12px rgba(0,0,0,0.7)',
    'color:white', 'font-size:28px',
    'cursor:pointer', 'touch-action:none',
    'display:flex', 'align-items:center', 'justify-content:center',
    'transition:border-color 0.15s',
  ].join(';');
  btn.innerHTML = '⚪';

  // Red contact dot indicator (shown on button when spin is set)
  const btnDot = document.createElement('div');
  btnDot.style.cssText = [
    'position:absolute',
    'width:10px', 'height:10px', 'border-radius:50%',
    'background:#d33a3a',
    'transform:translate(14px,-14px)',
    'pointer-events:none',
  ].join(';');
  btn.style.position = 'relative';
  btn.appendChild(btnDot);

  // Expanded disc panel — 130×130dp, shown on open
  const D = DISC_RADIUS * 2;
  const panel = document.createElement('div');
  panel.style.cssText = [
    `width:${D}px`, `height:${D}px`, 'border-radius:50%',
    'border:2px solid rgba(255,255,255,0.6)',
    'background:rgba(28,36,48,0.9)',
    'box-shadow:0 4px 20px rgba(0,0,0,0.8)',
    'position:relative',
    'display:none', 'touch-action:none', 'user-select:none',
    'transform:scale(0.6)', 'opacity:0',
    'transition:transform 0.15s ease-out, opacity 0.15s ease-out',
  ].join(';');

  const hline = document.createElement('div');
  hline.style.cssText = `position:absolute;top:50%;left:10%;width:80%;height:1px;background:rgba(255,255,255,0.2);transform:translateY(-50%);pointer-events:none;`;
  const vline = document.createElement('div');
  vline.style.cssText = `position:absolute;left:50%;top:10%;height:80%;width:1px;background:rgba(255,255,255,0.2);transform:translateX(-50%);pointer-events:none;`;

  // Top/bottom/left/right labels
  const makeLabel = (text: string, css: string) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;${css}font-size:9px;color:rgba(255,255,255,0.4);pointer-events:none;`;
    return el;
  };
  panel.appendChild(makeLabel('F', 'top:4px;left:50%;transform:translateX(-50%);'));
  panel.appendChild(makeLabel('D', 'bottom:4px;left:50%;transform:translateX(-50%);'));

  // Spin dot (red contact point)
  const dot = document.createElement('div');
  dot.style.cssText = [
    'position:absolute',
    `width:${DOT_R * 2}px`, `height:${DOT_R * 2}px`,
    'border-radius:50%', 'background:#d33a3a',
    'transform:translate(-50%,-50%)', 'pointer-events:none',
    'box-shadow:0 0 6px rgba(211,58,58,0.8)',
  ].join(';');

  panel.appendChild(hline);
  panel.appendChild(vline);
  panel.appendChild(dot);
  overlay.appendChild(spinLabel);
  overlay.appendChild(panel);
  overlay.appendChild(btn);
  container.appendChild(overlay);

  // ─── Dot position sync ──────────────────────────────────────────────────────

  function syncDot(): void {
    const cx = DISC_RADIUS + disc.spinX * DISC_RADIUS * VISUAL_SCALE;
    const cy = DISC_RADIUS - disc.spinY * DISC_RADIUS * VISUAL_SCALE;
    dot.style.left = `${cx}px`;
    dot.style.top = `${cy}px`;
    // Reflect spin on collapsed button dot
    const hasSpinX = Math.abs(disc.spinX) > 0.05;
    const hasSpinY = Math.abs(disc.spinY) > 0.05;
    const ox = (disc.spinX * 14).toFixed(1);
    const oy = (-disc.spinY * 14).toFixed(1);
    btnDot.style.transform = (hasSpinX || hasSpinY)
      ? `translate(calc(50% + ${ox}px), calc(-50% + ${oy}px))`
      : 'translate(14px,-14px)';
    btnDot.style.opacity = (hasSpinX || hasSpinY) ? '1' : '0.5';
  }
  syncDot();

  // ─── Auto-close timer ───────────────────────────────────────────────────────

  function _scheduleAutoClose(): void {
    if (_autoCloseTimer) clearTimeout(_autoCloseTimer);
    _autoCloseTimer = setTimeout(() => {
      hidePanel();
    }, AUTO_CLOSE_MS);
  }

  function _cancelAutoClose(): void {
    if (_autoCloseTimer) { clearTimeout(_autoCloseTimer); _autoCloseTimer = null; }
  }

  // ─── Panel open/close ───────────────────────────────────────────────────────

  function showPanel(): void {
    panel.style.display = 'block';
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      panel.style.transform = 'scale(1)';
      panel.style.opacity = '1';
    });
    syncDot();
    btn.style.borderColor = 'rgba(0,206,209,0.8)';
    _scheduleAutoClose();
  }

  function hidePanel(): void {
    _cancelAutoClose();
    panel.style.transform = 'scale(0.6)';
    panel.style.opacity = '0';
    btn.style.borderColor = 'rgba(255,255,255,0.35)';
    overlay.style.opacity = '0.4';
    setTimeout(() => { panel.style.display = 'none'; }, 150);
  }

  btn.addEventListener('click', () => {
    if (panel.style.display === 'none' || panel.style.opacity === '0') {
      disc.open();
      showPanel();
      overlay.style.opacity = '0.9';
    } else {
      disc.close();
      hidePanel();
      overlay.style.opacity = '0.4';
    }
  });

  // ─── Pointer coordinate conversion ─────────────────────────────────────────

  function toNormalized(clientX: number, clientY: number): { nx: number; ny: number } {
    const rect = panel.getBoundingClientRect();
    const cx = rect.left + DISC_RADIUS, cy = rect.top + DISC_RADIUS;
    return {
      nx:  (clientX - cx) / DISC_RADIUS * KOEFICIENT,
      ny: -(clientY - cy) / DISC_RADIUS * KOEFICIENT,
    };
  }

  // ─── Disc pointer events ────────────────────────────────────────────────────

  panel.addEventListener('pointerdown', (e: PointerEvent) => {
    _cancelAutoClose();
    const { nx, ny } = toNormalized(e.clientX, e.clientY);
    const hit = disc.pointerDown(nx, ny);
    if (hit) {
      syncDot();
      panel.setPointerCapture(e.pointerId);
    } else {
      disc.close();
      hidePanel();
    }
    e.preventDefault();
    e.stopPropagation();
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
      syncDot();
      _scheduleAutoClose();  // auto-close after setting spin
    }
    e.preventDefault();
  });

  // ─── Public interface ───────────────────────────────────────────────────────

  return {
    get element() { return overlay; },

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
      _cancelAutoClose();
      container.removeChild(overlay);
    },
  };
}
