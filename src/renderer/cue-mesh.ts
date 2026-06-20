/**
 * CUE-001 + CUE-016: 3D cue stick mesh — aim rotation + Lerp smooth follow.
 *
 * Matches C# CueObjectController: the mesh Lerps toward the target cuePoint
 * position/rotation each frame (positionSpeed / rotationSpeed).
 *
 * Pure helpers (cueYAngle, lerpAngle) are exported for unit testing.
 * Three.js layer is browser-only and not unit-tested.
 */

import * as THREE from 'three';
import type { CmVector } from '../physics/cm-vector';
import { MULTIPLIER } from '../physics/fixed-math';
import { backswingOffset, shotPunchOffset, SHOT_ANIM_DURATION } from '../game/shot-animation';

// ─── Constants ────────────────────────────────────────────────────────────────

const CUE_LENGTH = 1.45;        // meters (standard cue stick)
const CUE_TIP_RADIUS = 0.006;   // meters
const CUE_BUTT_RADIUS = 0.014;  // meters
const CUE_SEGMENTS = 8;
const CUE_OFFSET = 0.034;       // gap from pivot center to tip (ball_radius + clearance)
const CUE_LERP_SPEED = 10;      // rotational/positional lerp factor per second

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Map a normalized aim direction (dx, dz) to a Three.js Y-axis rotation.
 * With this rotation, the group's local +Z axis points in world direction (dx, 0, dz),
 * so a cylinder at local z < 0 extends behind the ball in the anti-aim direction.
 */
export function cueYAngle(aimDirX: number, aimDirZ: number): number {
  return Math.atan2(aimDirX, aimDirZ);
}

/**
 * Interpolate from `current` to `target` angle by fraction `t`, always taking
 * the shortest arc (wraps at ±π). t is clamped to [0, 1].
 */
export function lerpAngle(current: number, target: number, t: number): number {
  const tau = Math.PI * 2;
  const delta = ((target - current) % tau + tau + Math.PI) % tau - Math.PI;
  return current + delta * Math.min(t, 1);
}

// ─── Three.js mesh (not unit-tested) ─────────────────────────────────────────

export interface CueMeshController {
  /**
   * Called each drag-update: sets target + applies one Lerp step.
   * @param vertAngle CUE-004: elevation angle in degrees (0 = horizontal, 70 = nearly vertical).
   *                  Mesh rotates with 'YXZ' Euler order so Y-aim is applied first,
   *                  then X-pitch elevates the butt relative to the tip.
   * @param powerFraction CUE-011: current power [0,1] for backswing visual offset.
   */
  update(cueBallPos: CmVector, aimDir: CmVector | null, dt: number, vertAngle?: number, powerFraction?: number): void;
  /**
   * CUE-011: Begin the shot punch animation.
   * The cue stick lerps from startOffset (meters behind pivot) to 0 over SHOT_ANIM_DURATION.
   * onComplete is called when the animation ends; caller is responsible for hiding the cue.
   */
  startPunchAnimation(startOffset: number, onComplete?: () => void): void;
  dispose(): void;
}

export function createCueMesh(scene: THREE.Scene): CueMeshController {
  const group = new THREE.Group();

  // Cue cylinder: default height along Y → rotate 90° around X to lay along Z.
  const geo = new THREE.CylinderGeometry(CUE_TIP_RADIUS, CUE_BUTT_RADIUS, CUE_LENGTH, CUE_SEGMENTS);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6 });
  const stick = new THREE.Mesh(geo, mat);
  stick.rotation.x = Math.PI / 2;
  // Tip at local z = -CUE_OFFSET (just behind ball pivot), butt at z = -(CUE_LENGTH + CUE_OFFSET)
  stick.position.z = -(CUE_LENGTH / 2 + CUE_OFFSET);
  stick.castShadow = true;
  group.add(stick);

  scene.add(group);
  group.visible = false;

  let _currentYAngle = 0;
  let _currentXAngle = 0;   // CUE-004: elevation pitch (radians)
  let _punchElapsed = -1;   // CUE-011: -1 = not animating; ≥0 = elapsed seconds into punch
  let _punchStartOffset = 0;
  let _punchCallback: (() => void) | null = null;
  let _savedAimDir: CmVector | null = null;      // CUE-011: held for punch frames after drag ends
  let _savedCueBallPos: CmVector | null = null;

  return {
    update(cueBallPos: CmVector, aimDir: CmVector | null, dt: number, vertAngle = 0, powerFraction = 0): void {
      const isPunching = _punchElapsed >= 0;

      // During punch animation, use saved direction if caller has no current aim
      const effectiveAimDir = aimDir ?? (isPunching ? _savedAimDir : null);
      const effectiveCueBallPos = (isPunching && !aimDir && _savedCueBallPos) ? _savedCueBallPos : cueBallPos;

      if (!effectiveAimDir) {
        if (!isPunching) group.visible = false;
        return;
      }

      // Persist direction for punch frames that arrive after onDragEnd clears aim
      if (aimDir) {
        _savedAimDir = aimDir;
        _savedCueBallPos = cueBallPos;
      }

      // Convert aim direction from Fixed to float and normalize
      const dxF = effectiveAimDir.x / MULTIPLIER;
      const dzF = effectiveAimDir.z / MULTIPLIER;
      const mag = Math.sqrt(dxF * dxF + dzF * dzF);
      if (mag < 1e-9) {
        if (!isPunching) group.visible = false;
        return;
      }

      group.visible = true;

      // Lerp position toward cue ball center
      const targetX = effectiveCueBallPos.x / MULTIPLIER;
      const targetY = effectiveCueBallPos.y / MULTIPLIER;
      const targetZ = effectiveCueBallPos.z / MULTIPLIER;
      const t = Math.min(CUE_LERP_SPEED * dt, 1);
      group.position.set(
        group.position.x + (targetX - group.position.x) * t,
        group.position.y + (targetY - group.position.y) * t,
        group.position.z + (targetZ - group.position.z) * t,
      );

      // Lerp Y rotation toward aim angle (CUE-016 smooth follow)
      const targetYAngle = cueYAngle(dxF / mag, dzF / mag);
      _currentYAngle = lerpAngle(_currentYAngle, targetYAngle, t);

      // CUE-004: Lerp X pitch toward elevation angle.
      // rotation.x > 0 → nose-down (tip dips, butt rises) = physical cue elevation.
      // 'YXZ' order: Y-aim first, then X-pitch in local frame (perpendicular to aim).
      const targetXAngle = (vertAngle * Math.PI) / 180;
      _currentXAngle += (targetXAngle - _currentXAngle) * t;

      group.rotation.order = 'YXZ';
      group.rotation.set(_currentXAngle, _currentYAngle, 0, 'YXZ');

      // CUE-011: Z offset — backswing during aiming, or shrinking punch offset during animation
      let zOffset: number;
      if (isPunching) {
        _punchElapsed += dt;
        if (_punchElapsed >= SHOT_ANIM_DURATION) {
          // Punch complete — hide cue and fire callback
          _punchElapsed = -1;
          group.visible = false;
          const cb = _punchCallback;
          _punchCallback = null;
          cb?.();
          return;
        }
        zOffset = shotPunchOffset(_punchElapsed, SHOT_ANIM_DURATION, _punchStartOffset);
      } else {
        zOffset = backswingOffset(powerFraction);
      }
      stick.position.z = -(CUE_LENGTH / 2 + CUE_OFFSET + zOffset);
    },

    startPunchAnimation(startOffset: number, onComplete?: () => void): void {
      _punchElapsed = 0;
      _punchStartOffset = startOffset;
      _punchCallback = onComplete ?? null;
    },

    dispose(): void {
      scene.remove(group);
      geo.dispose();
      mat.dispose();
    },
  };
}
