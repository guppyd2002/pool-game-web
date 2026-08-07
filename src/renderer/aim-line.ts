/**
 * P1-T02 / SP-Harden-9: AimLine — cue-ball primary aim/travel guide (Unity hitLineBase).
 *
 * CEO feedback (SP-Harden-9 fix): the TEMP slider must control THIS line (cue → aim
 * direction, extendable past contact), NOT post-contact ghost separation arms
 * (lineDistance / line-of-centers). Those stay at SEPARATION_LINE_DEFAULT_LENGTH.
 *
 * Pure helpers are unit-tested; Three.js Line2 wrapper is browser-only.
 */

import * as THREE from 'three';
import { MULTIPLIER } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import type { AimHit } from '../game/ball-pool-physics';
import { ghostCenter } from './ghost-ball';

/** Convert a Fixed-point CmVector to a Three.js world-space Vector3. */
export function toWorld(v: CmVector): THREE.Vector3 {
  return new THREE.Vector3(v.x / MULTIPLIER, v.y / MULTIPLIER, v.z / MULTIPLIER);
}

/**
 * Default length (m) of the cue aim/travel guide along aim direction @ full display.
 * Not Unity lineDistance (0.25 = post-contact arms). Table long axis is 2.54 m;
 * 1.5 m is a useful default so the guide extends past typical first contact.
 */
export const DEFAULT_CUE_AIM_GUIDE_LENGTH_M = 1.5;

/** SP-Harden-9d: TEMP slider B min/max MUST match setter clamp (gate ⑤). */
export const CUE_AIM_GUIDE_MIN_M = 0.1;
export const CUE_AIM_GUIDE_MAX_M = 3.0;

/** Live cue aim-guide length (meters). Mutable for TEMP CEO slider. */
let _cueAimGuideLengthM = DEFAULT_CUE_AIM_GUIDE_LENGTH_M;

export function getCueAimGuideLengthM(): number {
  return _cueAimGuideLengthM;
}

/** Set cue aim-guide length in meters (clamped CUE_AIM_GUIDE_MIN/MAX). Returns applied value. */
export function setCueAimGuideLengthM(m: number): number {
  _cueAimGuideLengthM = Math.max(CUE_AIM_GUIDE_MIN_M, Math.min(CUE_AIM_GUIDE_MAX_M, m));
  return _cueAimGuideLengthM;
}

/**
 * Compute polyline for the cue primary aim guide (hitLineBase family).
 *
 * CEO 2026-08-07 bake: 母球導引線固定「母球 → ghost/接觸點」，不可調長度。
 *   - ball:    end = ghost center (imaginary ball at contact)
 *   - cushion/none: end = first contact point
 * guideLength retained in signature for API compat but **ignored**.
 * Post-contact target arm is ghost-ball.ts only (default 0.3 m).
 */
export function computeAimLinePoints(
  cueBallPos: CmVector,
  hit: AimHit,
  _guideLength: number = _cueAimGuideLengthM,
  _bounceLength = 0.25,
): THREE.Vector3[] {
  const from = toWorld(cueBallPos);

  // End at ghost (ball) or contact point (cushion/none) — never past contact.
  let aimTarget: THREE.Vector3;
  if (hit.hitType === 'ball') {
    const g = ghostCenter(hit);
    aimTarget = new THREE.Vector3(g.x, g.y, g.z);
  } else {
    aimTarget = toWorld(hit.point);
  }

  // Flatten Y so the line stays on the table plane.
  const end = new THREE.Vector3(aimTarget.x, from.y, aimTarget.z);
  return [from, end];
}

// ─── Three.js wrapper (browser) ───────────────────────────────────────────────

import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Aim line width in CSS pixels (applies on all WebGL devices including mobile). */
const AIM_LINE_WIDTH = 2.5;

/** Legal cyan-blue guide (CEO "blue line"); illegal red. */
const AIM_COLOR_LEGAL   = 0x4db8ff;
const AIM_COLOR_ILLEGAL = 0xff3333;

export interface AimLineVisual {
  /**
   * Refresh the line from current CueController state. Pass null to hide.
   * isLegal=false paints red (illegal first-ball target).
   */
  update(cueBallPos: CmVector, hit: AimHit | null, isLegal?: boolean): void;
  dispose(): void;
}

export function createAimLine(scene: THREE.Scene): AimLineVisual {
  const mat = new LineMaterial({
    color: AIM_COLOR_LEGAL,
    opacity: 0.95,
    transparent: true,
    linewidth: AIM_LINE_WIDTH,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  const geo = new LineGeometry();
  geo.setPositions([0, 0, 0, 0, 0, 0]);

  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.visible = false;
  scene.add(line);

  function _onResize(): void {
    mat.resolution.set(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', _onResize);

  return {
    update(cueBallPos: CmVector, hit: AimHit | null, isLegal = true): void {
      const pts = hit ? computeAimLinePoints(cueBallPos, hit) : [];
      if (pts.length < 2) {
        line.visible = false;
        return;
      }
      mat.color.setHex(isLegal ? AIM_COLOR_LEGAL : AIM_COLOR_ILLEGAL);
      geo.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
      line.computeLineDistances();
      line.visible = true;
    },

    dispose(): void {
      window.removeEventListener('resize', _onResize);
      scene.remove(line);
      geo.dispose();
      mat.dispose();
    },
  };
}
