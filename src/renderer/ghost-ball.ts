/**
 * CUE-010: Ghost ball sphere + separation prediction lines.
 *
 * C# source: CueCalculateManager.DrawShotLinesAndSphere
 *   hitSphere.position = Point + Normal * ballRadius  ← ghost ball center
 *   hitLine (4 pts)    = [ghost, deflect_end, ghost, target_end]  ← separation lines
 *
 * Pure helpers (ghostCenter, computeSeparationLines) are exported for unit testing.
 * Three.js wrapper (GhostBallVisual) is browser-only.
 */

import * as THREE from 'three';
import { MULTIPLIER } from '../physics/fixed-math';
import { BALL_RADIUS } from '../physics/constants';
import type { AimHit } from '../game/ball-pool-physics';
import type { CmVector } from '../physics/cm-vector';

/** Separation line length (meters) when power = 1. Matches C# lineDistance = 0.8. */
export const SEPARATION_LINE_DEFAULT_LENGTH = 0.8;

const M = MULTIPLIER;
const R = BALL_RADIUS / M;  // 0.0285m

/** World-space ghost ball center (cue ball center at contact moment). */
export function ghostCenter(hit: AimHit): { x: number; y: number; z: number } {
  // C#: hitSphere.position = CueBallHitInfo.Point + Normal * ballRadius
  const nx = hit.normal.x / M, ny = hit.normal.y / M, nz = hit.normal.z / M;
  return {
    x: hit.point.x / M + R * nx,
    y: hit.point.y / M + R * ny,
    z: hit.point.z / M + R * nz,
  };
}

/**
 * Compute 4 world-space points for ball-hit separation lines.
 * Returns null for non-ball hits (cushion lines handled by existing aim-line reflection).
 *
 * Layout: [ghost, cue_deflect_end, ghost, target_end]
 * Matches C# CueCalculateManager.DrawShotLinesAndSphere (HitType.Ball branch):
 *   kk = Dot(direction2, direction)
 *   s_deflect = Clamp01(1.5 - 1.5*kk) * lineLength
 *   s_target  = Clamp01(1.5*kk) * lineLength + 2*r
 *
 * @param lineLength total line budget in meters (scale by powerFraction before calling)
 */
export function computeSeparationLines(
  cueBallPos: CmVector,
  hit: AimHit,
  lineLength: number,
): Array<{ x: number; y: number; z: number }> | null {
  if (hit.hitType !== 'ball') return null;

  const g = ghostCenter(hit);
  const fx = cueBallPos.x / M, fz = cueBallPos.z / M;

  // Aim direction: from cue ball to ghost center (horizontal plane only)
  const dlen = Math.sqrt((g.x - fx) ** 2 + (g.z - fz) ** 2);
  if (dlen < 1e-9) return null;
  const dx = (g.x - fx) / dlen, dz = (g.z - fz) / dlen;

  // direction2 = −normal = from ghost toward target ball center
  const nx = hit.normal.x / M, nz = hit.normal.z / M;
  const d2x = -nx, d2z = -nz;

  // kk = Dot(direction2, aimDir)
  const kk = d2x * dx + d2z * dz;

  // direction1 = perp component of aimDir w.r.t. direction2 (cue ball deflection axis)
  const proj1x = kk * d2x, proj1z = kk * d2z;
  const p1x = dx - proj1x, p1z = dz - proj1z;
  const p1len = Math.sqrt(p1x * p1x + p1z * p1z);
  const dir1x = p1len > 1e-9 ? p1x / p1len : 0;
  const dir1z = p1len > 1e-9 ? p1z / p1len : 0;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const s1 = clamp01(1.5 - 1.5 * kk) * lineLength;
  const s2 = clamp01(1.5 * kk) * lineLength + 2 * R;

  return [
    { x: g.x,                 y: g.y, z: g.z },                 // ghost (cue deflect start)
    { x: g.x + s1 * dir1x,   y: g.y, z: g.z + s1 * dir1z },   // cue deflect end
    { x: g.x,                 y: g.y, z: g.z },                 // ghost (target path start)
    { x: g.x + s2 * d2x,     y: g.y, z: g.z + s2 * d2z },     // target ball end
  ];
}

// ─── Three.js wrapper (browser-only, not unit-tested) ────────────────────────

export interface GhostBallVisual {
  /**
   * Refresh ghost sphere + separation lines from current aim state.
   * Pass null to hide. powerFraction scales line length.
   */
  update(cueBallPos: CmVector, hit: AimHit | null, powerFraction?: number): void;
  dispose(): void;
}

export function createGhostBall(scene: THREE.Scene): GhostBallVisual {
  // Ghost sphere mesh (semi-transparent cue ball silhouette at contact point)
  const sphereGeo = new THREE.SphereGeometry(R, 12, 8);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.visible = false;
  scene.add(sphere);

  // Separation lines (2 lines drawn as a single 4-point LineSegments — [pt0,pt1] + [pt2,pt3])
  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6, transparent: true });
  const lineObj = new THREE.LineSegments(lineGeo, lineMat);
  lineObj.visible = false;
  scene.add(lineObj);

  return {
    update(cueBallPos: CmVector, hit: AimHit | null, powerFraction = 1): void {
      if (!hit || hit.hitType === 'none') {
        sphere.visible = false;
        lineObj.visible = false;
        return;
      }

      const g = ghostCenter(hit);
      sphere.position.set(g.x, g.y, g.z);
      sphere.visible = true;

      const linePts = computeSeparationLines(
        cueBallPos, hit,
        SEPARATION_LINE_DEFAULT_LENGTH * Math.max(0, Math.min(1, powerFraction)),
      );
      if (linePts) {
        lineGeo.setFromPoints(linePts.map(p => new THREE.Vector3(p.x, p.y, p.z)));
        lineObj.visible = true;
      } else {
        lineGeo.setFromPoints([]);
        lineObj.visible = false;
      }
    },

    dispose(): void {
      scene.remove(sphere);
      scene.remove(lineObj);
      sphereGeo.dispose();
      sphereMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
    },
  };
}
