/**
 * 8BP v2.1 landscape: Bottom-centre fine-adjust bar — ±θ precision aim rotation.
 *
 * 設計要點（橫屏）：
 *   - 底部中央水平 bar，680dp 行程（68px/°）。
 *   - 左右拖曳 = 瞄準角度 ±5°，立即寫回 controller._lastAimCurrent（C-2）。
 *   - 繞 _lastAimStart 旋 _lastAimCurrent，保點對，不建平行 θ。
 *   - 放開歸中＝純視覺（canonical 不變）。
 *   - Mutex: 由 main.ts onStartControl/onEndControl 呼叫 disable()/enable()。
 *   - stopPropagation: 底部 32dp 不傳播到球桌觸控區。
 *
 * Not unit-tested (DOM layer). Domain logic lives in cue-controller.ts.
 * applyFineAimRotation is exported for unit tests.
 */

import type { CueController, TablePoint } from '../game/cue-controller';

const TRACK_H = 32;
const THUMB_W = 48;
const THUMB_H = 28;

/** ±degrees for full bar travel — landscape gives 68px/° precision. */
export const FINE_ANGLE_MAX_DEG = 5;
const FINE_ANGLE_MAX = FINE_ANGLE_MAX_DEG * (Math.PI / 180);

/**
 * Rotate the aim direction by deltaTheta radians.
 * _lastAimCurrent rotates around _lastAimStart so (start−current) rotates by deltaTheta.
 * Returns the new current point. Pure function — exported for unit testing.
 */
export function applyFineAimRotation(
  baseStart: { x: number; z: number },
  baseCurrent: { x: number; z: number },
  deltaTheta: number,
): { x: number; z: number } {
  const dx = baseStart.x - baseCurrent.x;
  const dz = baseStart.z - baseCurrent.z;
  const cosT = Math.cos(deltaTheta);
  const sinT = Math.sin(deltaTheta);
  const newDx = dx * cosT - dz * sinT;
  const newDz = dx * sinT + dz * cosT;
  return { x: baseStart.x - newDx, z: baseStart.z - newDz };
}

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
  let _baseDragX = 0;
  let _trackWidth = 0;
  let _baseStart: TablePoint | null = null;
  let _baseCurrent: TablePoint | null = null;

  // ─── DOM structure ──────────────────────────────────────────────────────────

  // Outer wrapper — bottom centre, horizontally adaptive.
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:absolute',
    'bottom:12px',
    'left:50%', 'transform:translateX(-50%)',
    'width:min(680px, calc(100vw - 160px))',
    'z-index:100',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:4px',
    'user-select:none',
  ].join(';');

  const label = document.createElement('div');
  label.textContent = '← Fine Aim →';
  label.style.cssText = [
    'color:rgba(255,255,255,0.5)', 'font-size:9px', 'font-family:sans-serif',
    'letter-spacing:1px', 'pointer-events:none',
  ].join(';');

  // Track — horizontal, full overlay width, captures pointer events.
  const track = document.createElement('div');
  track.style.cssText = [
    `width:100%`, `height:${TRACK_H}px`, 'border-radius:16px',
    'background:rgba(0,0,0,0.88)', 'border:2px solid rgba(0,206,209,0.4)',
    'box-shadow:0 0 0 1px rgba(0,206,209,0.1),0 4px 20px rgba(0,0,0,0.8)',
    'position:relative', 'overflow:hidden',
    'touch-action:none', 'cursor:ew-resize',
  ].join(';');

  // Centre reference mark
  const centerMark = document.createElement('div');
  centerMark.style.cssText = [
    'position:absolute', 'top:4px', 'bottom:4px',
    'left:50%', 'width:2px', 'transform:translateX(-50%)',
    'background:rgba(255,255,255,0.2)', 'pointer-events:none',
  ].join(';');
  track.appendChild(centerMark);

  // Thumb — starts at centre, moves left/right
  const thumb = document.createElement('div');
  thumb.style.cssText = [
    'position:absolute', 'top:50%', 'transform:translate(-50%,-50%)',
    `width:${THUMB_W}px`, `height:${THUMB_H}px`,
    'background:rgba(0,206,209,0.85)', 'border-radius:14px',
    'pointer-events:none',
    'left:50%',
  ].join(';');
  track.appendChild(thumb);

  const angleText = document.createElement('div');
  angleText.textContent = '0°';
  angleText.style.cssText = [
    'color:rgba(0,206,209,0.8)', 'font-size:10px', 'font-family:sans-serif',
    'font-weight:bold', 'pointer-events:none',
  ].join(';');

  overlay.appendChild(track);
  overlay.appendChild(label);
  overlay.appendChild(angleText);
  container.appendChild(overlay);

  // ─── Visual sync ────────────────────────────────────────────────────────────

  function _setThumbCenter(): void {
    thumb.style.left = '50%';
    angleText.textContent = '0°';
  }

  function _syncThumb(fraction: number): void {
    // fraction ∈ [-1, 1]: -1 = far left (max CCW), 0 = centre, +1 = far right (max CW)
    thumb.style.left = `${50 + fraction * 50}%`;
    const deg = Math.round(fraction * FINE_ANGLE_MAX_DEG * 10) / 10;
    angleText.textContent = `${deg > 0 ? '+' : ''}${deg}°`;
  }

  // ─── Aim rotation geometry ───────────────────────────────────────────────────

  function _applyRotation(deltaTheta: number): void {
    if (!_baseStart || !_baseCurrent) return;
    controller.setFineAimCurrent(applyFineAimRotation(_baseStart, _baseCurrent, deltaTheta));
    onAimUpdate();
  }

  // ─── Pointer events ─────────────────────────────────────────────────────────

  track.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!_enabled) return;
    const { start, current } = controller.getAimState();
    if (!start || !current) return;
    track.setPointerCapture(e.pointerId);
    _dragging = true;
    _baseDragX = e.clientX;
    _trackWidth = track.getBoundingClientRect().width;
    _baseStart = { ...start };
    _baseCurrent = { ...current };
    e.preventDefault();
    e.stopPropagation();
  });

  track.addEventListener('pointermove', (e: PointerEvent) => {
    if (!_dragging || !_enabled) return;
    const deltaX = e.clientX - _baseDragX;
    const halfRange = _trackWidth / 2;
    const normalizedPos = Math.max(-1, Math.min(1, deltaX / halfRange));
    // Right drag = CW rotation (positive theta)
    const deltaTheta = normalizedPos * FINE_ANGLE_MAX;
    _applyRotation(deltaTheta);
    _syncThumb(normalizedPos);
    e.preventDefault();
  });

  track.addEventListener('pointerup', (_e: PointerEvent) => {
    if (!_dragging) return;
    _dragging = false;
    _setThumbCenter();
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
