/**
 * GAME-015 B-lite — camera pose tween.
 * Lerps camera between two poses on START_GAME (→ table) and EXIT_GAME (→ overview).
 * No room scene mesh; overview is a pulled-back bird-eye of the existing table.
 */

import * as THREE from 'three';

export interface CameraPose {
  readonly position: readonly [number, number, number];  // [x, y, z] meters
  readonly lookAt: readonly [number, number, number];
}

/** Main menu / exit — pulled back overview. */
export const POSE_OVERVIEW: CameraPose = {
  position: [0, 5.0, 3.5],
  lookAt: [0, 0, 0],
};

/** In-game — desktop / tall viewport table view (matches historical scene.ts init). */
export const POSE_TABLE: CameraPose = {
  position: [0, 2.5, 1.8],
  lookAt: [0, 0, 0],
};

/**
 * SP-Harden-3b: short-landscape play pose — pull back so all 6 pockets stay in
 * the visible band between top HUD (~56px) and bottom tutorial pill on ~390px height.
 * Used by scene.ts + start-game tween when viewport is short/wide.
 */
export const POSE_TABLE_MOBILE: CameraPose = {
  position: [0, 3.65, 2.55],
  lookAt: [0, 0, 0],
};

/** FOV (deg) paired with POSE_TABLE / POSE_TABLE_MOBILE. */
export const FOV_TABLE = 50;
export const FOV_TABLE_MOBILE = 44;

/**
 * Pick play pose + FOV for current viewport.
 * Short landscape (e.g. iPhone 844×390): mobile pose. Otherwise desktop.
 */
export function getPlayView(
  viewportW: number,
  viewportH: number,
): { pose: CameraPose; fov: number } {
  const aspect = viewportW / Math.max(1, viewportH);
  // 390–440px height landscape phones; also wide aspect with short height.
  const shortLandscape =
    viewportH <= 440 || (aspect >= 1.85 && viewportH <= 520);
  if (shortLandscape) {
    return { pose: POSE_TABLE_MOBILE, fov: FOV_TABLE_MOBILE };
  }
  return { pose: POSE_TABLE, fov: FOV_TABLE };
}

// POSE_TOP removed: 'T' key now uses scene.setOrthoTop() — strict OrthographicCamera
// looking straight down. No perspective hack needed (z=0.3 gimbal workaround gone).

export interface CameraTween {
  tweenTo(pose: CameraPose, durationSecs?: number): void;
  update(dtSecs: number): void;
  readonly isActive: boolean;
}

export function createCameraTween(camera: THREE.PerspectiveCamera): CameraTween {
  let _fromPos = new THREE.Vector3(...POSE_OVERVIEW.position);
  let _toPos   = new THREE.Vector3(...POSE_OVERVIEW.position);
  let _t = 1.0;
  let _duration = 0.5;

  return {
    tweenTo(pose, durationSecs = 0.5): void {
      _fromPos = camera.position.clone();
      _toPos   = new THREE.Vector3(...pose.position);
      _t = durationSecs <= 0 ? 1 : 0;
      _duration = durationSecs > 0 ? durationSecs : 0.001;
      if (_t >= 1) {
        camera.position.copy(_toPos);
        camera.lookAt(...pose.lookAt);
      }
    },

    update(dtSecs): void {
      if (_t >= 1) return;
      _t = Math.min(_t + dtSecs / _duration, 1);
      camera.position.lerpVectors(_fromPos, _toPos, _t);
      camera.lookAt(0, 0, 0);
    },

    get isActive() { return _t < 1; },
  };
}
