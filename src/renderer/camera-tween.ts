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

/** In-game — standard table view matching scene.ts camera init. */
export const POSE_TABLE: CameraPose = {
  position: [0, 2.5, 1.8],
  lookAt: [0, 0, 0],
};

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
