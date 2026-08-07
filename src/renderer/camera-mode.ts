/**
 * FEAT-CAM-002 — Camera mode switching (web 8BP adaptation).
 *
 * Unity: FirstPerson / ThirdPerson / TwoD.
 * Web landscape UX (CEO 8BP): top ortho (default), orbit perspective, overview menu.
 * Follow = lightweight InShot FOV/look assist (not full Unity FirstPerson).
 */

export type CameraMode = 'overview' | 'top' | 'orbit' | 'follow';

export interface CameraModeState {
  mode: CameraMode;
  /** Previous play mode when entering overview (restore on enter table). */
  lastPlayMode: Exclude<CameraMode, 'overview'>;
}

export interface CameraModeController {
  readonly mode: CameraMode;
  setMode(mode: CameraMode): void;
  /** Cycle top ↔ orbit (HUD / T key companion). */
  toggleTopOrbit(): CameraMode;
  /** Enter table from menu — restores lastPlayMode (default top). */
  enterTable(): CameraMode;
  /** Exit to overview. */
  enterOverview(): CameraMode;
}

export function createCameraModeController(
  initial: CameraMode = 'overview',
  onChange?: (mode: CameraMode, prev: CameraMode) => void,
): CameraModeController {
  let mode: CameraMode = initial;
  let lastPlayMode: Exclude<CameraMode, 'overview'> = 'top';

  function _set(next: CameraMode): void {
    if (next === mode) return;
    const prev = mode;
    mode = next;
    if (next !== 'overview') lastPlayMode = next;
    onChange?.(next, prev);
  }

  return {
    get mode() { return mode; },
    setMode(m) { _set(m); },
    toggleTopOrbit(): CameraMode {
      if (mode === 'overview') {
        _set(lastPlayMode === 'orbit' ? 'orbit' : 'top');
      } else if (mode === 'top') {
        _set('orbit');
      } else {
        _set('top');
      }
      return mode;
    },
    enterTable(): CameraMode {
      _set(lastPlayMode);
      return mode;
    },
    enterOverview(): CameraMode {
      _set('overview');
      return mode;
    },
  };
}

/** CAM-003: clamp FOV after wheel/pinch delta (deg). */
export function applyZoomFov(currentFov: number, delta: number, min = 28, max = 70): number {
  return Math.max(min, Math.min(max, currentFov + delta));
}

/**
 * CAM-004 lite: speed-weighted look target among active balls (Unity FollowBalls simplified).
 * Positions/velocities in world meters. Falls back to origin if empty.
 */
export function computeFollowLookAt(
  balls: ReadonlyArray<{ x: number; y: number; z: number; speed: number }>,
): { x: number; y: number; z: number } {
  if (balls.length === 0) return { x: 0, y: 0, z: 0 };
  let wSum = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const b of balls) {
    const w = 1 + Math.max(0, b.speed);
    wSum += w;
    x += b.x * w;
    y += b.y * w;
    z += b.z * w;
  }
  if (wSum <= 0) return { x: balls[0].x, y: balls[0].y, z: balls[0].z };
  return { x: x / wSum, y: y / wSum, z: z / wSum };
}

/** Dynamic FOV boost while balls are moving (Unity FollowBalls FOV feel, simplified). */
export function computeFollowFov(baseFov: number, maxSpeed: number, maxBoost = 12): number {
  const t = Math.max(0, Math.min(1, maxSpeed / 2.5)); // ~2.5 m/s full boost
  return baseFov + maxBoost * t;
}
