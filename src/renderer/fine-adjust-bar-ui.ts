/**
 * 8BP v2.1 F-④: Left-side fine-adjust bar — ±θ precision aim rotation.
 *
 * 設計要點：
 *   - 左側直立 bar，與右側 power bar 對稱；拇指可達。
 *   - 每次 pointermove 立即把旋轉後的新角寫回 controller._lastAimCurrent（C-2）。
 *   - 繞 _lastAimStart 旋 _lastAimCurrent，保點對，不建平行 θ。
 *   - 放開歸中＝純視覺（canonical 不變）。
 *   - Mutex: 由 main.ts onStartControl/onEndControl 呼叫 disable()/enable()。
 *
 * Not unit-tested (DOM layer). Domain logic lives in cue-controller.ts.
 */

import type { CueController, TablePoint } from '../game/cue-controller';

const BAR_H = 160;
const BAR_W = 32;
const THUMB_H = 20;

/** ±degrees for full bar travel. M-5: real-device verify if ±3° is sufficient. */
export const FINE_ANGLE_MAX_DEG = 3;
const FINE_ANGLE_MAX = FINE_ANGLE_MAX_DEG * (Math.PI / 180);

export interface FineAdjustBarUI {
  readonly element: HTMLElement;
  enable(): void;
  disable(): void;
  dispose(): void;
}

export function createFineAdjustBarUI(
  container: HTMLElement,
  controller: CueController,
  onAimUpdate: () => void,
): FineAdjustBarUI {
  let _enabled = true;
  let _dragging = false;
  let _baseDragY = 0;
  let _baseStart: TablePoint | null = null;
  let _baseCurrent: TablePoint | null = null;

  // ─── DOM structure ──────────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'left:max(12px, calc(4px + env(safe-area-inset-left, 0px)))',
    'top:50%', 'transform:translateY(-50%)',
    'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:6px',
    'user-select:none',
  ].join(';');

  const label = document.createElement('div');
  label.textContent = '精瞄';
  label.style.cssText = [
    'color:rgba(255,255,255,0.7)', 'font-size:10px', 'font-family:sans-serif',
    'letter-spacing:1px', 'pointer-events:none',
  ].join(';');

  const track = document.createElement('div');
  track.style.cssText = [
    `width:${BAR_W}px`, `height:${BAR_H}px`, 'border-radius:18px',
    'background:rgba(0,0,0,0.88)', 'border:2px solid rgba(255,255,255,0.45)',
    'box-shadow:0 0 0 1px rgba(255,255,255,0.10),0 4px 20px rgba(0,0,0,0.8)',
    'position:relative', 'overflow:hidden',
    'touch-action:none', 'cursor:ns-resize',
  ].join(';');

  // Center reference line
  const centerLine = document.createElement('div');
  centerLine.style.cssText = [
    'position:absolute', `top:${(BAR_H - 2) / 2}px`, 'left:4px', 'right:4px', 'height:2px',
    'background:rgba(255,255,255,0.25)', 'pointer-events:none',
  ].join(';');
  track.appendChild(centerLine);

  // Thumb (draggable indicator, starts at center)
  const thumb = document.createElement('div');
  thumb.style.cssText = [
    'position:absolute', 'left:2px', 'right:2px', `height:${THUMB_H}px`,
    `top:${(BAR_H - THUMB_H) / 2}px`,
    'background:rgba(100,200,255,0.85)', 'border-radius:8px',
    'pointer-events:none',
  ].join(';');
  track.appendChild(thumb);

  const angleText = document.createElement('div');
  angleText.textContent = '0°';
  angleText.style.cssText = [
    'color:rgba(255,255,255,0.7)', 'font-size:10px', 'font-family:sans-serif',
    'font-weight:bold', 'pointer-events:none',
  ].join(';');

  const hint = document.createElement('div');
  hint.textContent = '± 微調';
  hint.style.cssText = [
    'color:rgba(255,255,255,0.35)', 'font-size:8px', 'font-family:sans-serif',
    'pointer-events:none', 'text-align:center',
  ].join(';');

  overlay.appendChild(label);
  overlay.appendChild(track);
  overlay.appendChild(angleText);
  overlay.appendChild(hint);
  container.appendChild(overlay);

  // ─── Visual sync ────────────────────────────────────────────────────────────

  function _setThumbCenter(): void {
    thumb.style.top = `${(BAR_H - THUMB_H) / 2}px`;
    angleText.textContent = '0°';
  }

  function _syncThumb(fraction: number): void {
    // fraction ∈ [-1, 1]: -1 = top (max CCW), 0 = center, +1 = bottom (max CW)
    const centerY = (BAR_H - THUMB_H) / 2;
    thumb.style.top = `${centerY + fraction * centerY}px`;
    const deg = Math.round(fraction * FINE_ANGLE_MAX_DEG * 10) / 10;
    angleText.textContent = `${deg > 0 ? '+' : ''}${deg}°`;
  }

  // ─── Aim rotation geometry ───────────────────────────────────────────────────

  function _applyRotation(deltaTheta: number): void {
    if (!_baseStart || !_baseCurrent) return;
    const dx = _baseStart.x - _baseCurrent.x;
    const dz = _baseStart.z - _baseCurrent.z;
    const cosT = Math.cos(deltaTheta);
    const sinT = Math.sin(deltaTheta);
    const newDx = dx * cosT - dz * sinT;
    const newDz = dx * sinT + dz * cosT;
    // newCurrent = baseStart - rotated(baseStart - baseCurrent)
    controller.setFineAimCurrent({ x: _baseStart.x - newDx, z: _baseStart.z - newDz });
    onAimUpdate();
  }

  // ─── Pointer events ─────────────────────────────────────────────────────────

  track.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!_enabled) return;
    const { start, current } = controller.getAimState();
    if (!start || !current) return;  // no aim to fine-adjust yet
    track.setPointerCapture(e.pointerId);
    _dragging = true;
    _baseDragY = e.clientY;
    _baseStart = { ...start };
    _baseCurrent = { ...current };
    e.preventDefault();
    e.stopPropagation();
  });

  track.addEventListener('pointermove', (e: PointerEvent) => {
    if (!_dragging || !_enabled) return;
    const deltaY = e.clientY - _baseDragY;
    const halfRange = BAR_H / 2;
    // Clamp normalized position to [-1, 1]
    const normalizedPos = Math.max(-1, Math.min(1, deltaY / halfRange));
    const deltaTheta = normalizedPos * FINE_ANGLE_MAX;
    _applyRotation(deltaTheta);
    _syncThumb(normalizedPos);
    e.preventDefault();
  });

  track.addEventListener('pointerup', (_e: PointerEvent) => {
    if (!_dragging) return;
    _dragging = false;
    // Visual reset to center only — canonical _lastAimCurrent unchanged
    _setThumbCenter();
    // Update base state so next drag starts from current rotated position
    _baseStart = null;
    _baseCurrent = null;
  });

  track.addEventListener('pointercancel', (_e: PointerEvent) => {
    _dragging = false;
    _setThumbCenter();
    _baseStart = null;
    _baseCurrent = null;
  });

  // ─── Public interface ────────────────────────────────────────────────────────

  return {
    get element() { return overlay; },

    enable(): void { _enabled = true; },

    disable(): void {
      _enabled = false;
      _dragging = false;
      _setThumbCenter();
      _baseStart = null;
      _baseCurrent = null;
    },

    dispose(): void {
      container.removeChild(overlay);
    },
  };
}
