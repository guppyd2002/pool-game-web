/**
 * CUE-010 / SP-Harden-5: Ghost ball + separation prediction lines + pocket highlight.
 *
 * C# source: CueCalculateManager.DrawShotLinesAndSphere
 *   hitSphere.position = Point + Normal * ballRadius  ← ghost ball center
 *   hitLine (4 pts)    = [ghost, deflect_end, ghost, target_end]  ← separation lines
 *   pocket highlight when target path endpoint within pocketRadius of a pocket
 *
 * Pure helpers (ghostCenter, computeSeparationLines, nearestPocketAlongTarget)
 * are exported for unit testing. Three.js wrapper is browser-only.
 *
 * Spec: digital-twin architecture/features/aim-assist-and-group-hud-spec.md §2
 * Unity constants: lineDistance=0.25, pocketRadius=2R, legal white / illegal red.
 */

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MULTIPLIER } from '../physics/fixed-math';
import { BALL_RADIUS, POCKET_POSITIONS } from '../physics/constants';
import type { AimHit } from '../game/ball-pool-physics';
import type { CmVector } from '../physics/cm-vector';

/**
 * Default target post-contact extension length (meters).
 * CEO 2026-08-07 bake: 目標延伸線預設 0.3 m（只畫目標球被撞後前進方向）.
 */
export const SEPARATION_LINE_DEFAULT_LENGTH = 0.3;

/**
 * @deprecated CEO bake: cue-deflect stub removed — only target arm is drawn.
 * Kept for canary/bundle fingerprint continuity (numeric 2.2 unused in geometry).
 */
export const TARGET_TO_DEFLECT_RATIO = 2.2;

/**
 * SP-Harden-10 canary — Spot verifies prod bundle / `__poolDebug` contains this.
 * (setAimPowerFraction exists on 9d too; this symbol is 10-only.)
 */
export const SP_HARDEN_10_FIXED_AIM_LENGTH = true as const;
export const SP_HARDEN_10_CANARY = 'SP_HARDEN_10_FIXED_AIM_LENGTH' as const;

/** Live target-extension length (m) — fixed display length (no power/kk scale). */
let _lineDistanceM = SEPARATION_LINE_DEFAULT_LENGTH;

/** Current target post-contact extension length in meters (slider A / 8BP Aim). */
export function getAimLineDistanceM(): number {
  return _lineDistanceM;
}

/**
 * SP-Harden-9d: clamp for post-contact arm budget (target extension).
 * MUST stay in lockstep with TEMP slider A min/max (gate ⑤).
 * Not the cue blue guide — see aim-line DEFAULT_CUE_AIM_GUIDE_LENGTH_M.
 */
export const AIM_LINE_DISTANCE_MIN_M = 0.05;
export const AIM_LINE_DISTANCE_MAX_M = 2.0;

/**
 * Set target post-contact extension length in meters (clamped). Returns applied value.
 * SP-Harden-9d: clamp 0.05–2.0 m. SP-Harden-10: this value IS the drawn length
 * (8BP Aim scalar) — not a budget further scaled by power/kk.
 * NOT the cue blue guide (setCueAimGuideLengthM).
 */
export function setAimLineDistanceM(m: number): number {
  _lineDistanceM = Math.max(AIM_LINE_DISTANCE_MIN_M, Math.min(AIM_LINE_DISTANCE_MAX_M, m));
  return _lineDistanceM;
}

/**
 * Ghost / assist line colours.
 * SP-Harden-8: legal was pure white 0xffffff @ opacity 0.45 — blends into light
 * object balls. Use cool cyan fill + dark shell outline for stack contrast.
 */
export const ASSIST_COLOR_LEGAL   = 0x7ec8ff; // cyan-white (readable on yellow/cream balls)
export const ASSIST_COLOR_ILLEGAL = 0xff3333;
/** Dark outline shell so ghost silhouette pops on any ball colour. */
export const ASSIST_COLOR_OUTLINE = 0x0a0a12;

/** Fat-line width (CSS px) so target line-of-centers is visible on mobile. */
const ASSIST_LINE_WIDTH = 3.0;
/** Ghost fill opacity (was 0.45 pure white — too faint in ball stacks). */
export const GHOST_FILL_OPACITY = 0.55;
/** Slightly larger than R so the outline reads as a rim, not a second ball. */
const GHOST_OUTLINE_SCALE = 1.08;

const M = MULTIPLIER;
const R = BALL_RADIUS / M;  // 0.0285m

/** Unity pocket highlight radius ≈ 2R (ball diameter). */
export const POCKET_HIGHLIGHT_RADIUS = 2 * R;

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
 * Returns null for non-ball hits (cushion lines handled by aim-line reflection).
 *
 * Layout: [ghost, cue_deflect_end, ghost, target_end]
 *
 * CEO 2026-08-07 bake:
 *   - Only **target** post-contact arm is drawn (目標球被撞後前進方向 = direction2).
 *   - Cue-deflect stub removed (s_deflect = 0; caller hides zero-length arm).
 *   - s_target = lineLength (fixed, no power/kk scale); default 0.3 m.
 *   - direction2 = −normal (line-of-centers from ghost through target).
 *
 * @param lineLength target extension length in meters
 */
export function computeSeparationLines(
  cueBallPos: CmVector,
  hit: AimHit,
  lineLength: number,
): Array<{ x: number; y: number; z: number }> | null {
  if (hit.hitType !== 'ball') return null;

  const g = ghostCenter(hit);
  const fx = cueBallPos.x / M, fz = cueBallPos.z / M;

  // Need non-degenerate cue→ghost for valid contact geometry
  const dlen = Math.sqrt((g.x - fx) ** 2 + (g.z - fz) ** 2);
  if (dlen < 1e-9) return null;

  // direction2 = −normal = from ghost toward target ball center
  const nx = hit.normal.x / M, nz = hit.normal.z / M;
  const d2x = -nx, d2z = -nz;

  // CEO: only target extension arm; deflect stub zeroed
  const s2 = Math.max(0, lineLength);

  return [
    { x: g.x, y: g.y, z: g.z },                               // ghost (deflect start — unused)
    { x: g.x, y: g.y, z: g.z },                               // zero-length deflect
    { x: g.x, y: g.y, z: g.z },                               // ghost (target path start)
    { x: g.x + s2 * d2x, y: g.y, z: g.z + s2 * d2z },         // target ball end
  ];
}

/**
 * If the target-path endpoint lies within pocketRadius of a pocket centre,
 * return that pocket in world metres (for highlight). Else null.
 * Unity: pocketRadius = 2R, path endpoint = ghost + s_target * direction2.
 *
 * SP-Harden-10 DIV (catch#6 / Spot):
 *   - Pocket highlight is kept = deliberate escape from 8BP (8BP has none); CEO OK.
 *   - Web port has NO isEnoughEnergy / power gate. Highlight is driven only by
 *     geometry of the fixed-length target endpoint. Do NOT reintroduce energy
 *     gating — that would make the assist look power-dependent again.
 */
export function nearestPocketAlongTarget(
  targetEnd: { x: number; z: number },
  pocketRadius = POCKET_HIGHLIGHT_RADIUS,
): { x: number; y: number; z: number; pocketIndex: number } | null {
  let best: { x: number; y: number; z: number; pocketIndex: number } | null = null;
  let bestD2 = pocketRadius * pocketRadius;
  for (let i = 0; i < POCKET_POSITIONS.length; i++) {
    const px = POCKET_POSITIONS[i][0] / M;
    const pz = POCKET_POSITIONS[i][1] / M;
    const dx = targetEnd.x - px;
    const dz = targetEnd.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = { x: px, y: 0.002, z: pz, pocketIndex: i };
    }
  }
  return best;
}

// ─── Three.js wrapper (browser-only, not unit-tested) ────────────────────────

export interface GhostBallVisual {
  /**
   * Refresh ghost sphere + separation lines + pocket highlight.
   * Pass null hit to hide.
   * powerFraction retained for API compat; SP-Harden-10 arms ignore it (8BP fixed Aim).
   * isLegal=false → red (illegal target); true/omit → cyan/white.
   */
  update(
    cueBallPos: CmVector,
    hit: AimHit | null,
    powerFraction?: number,
    isLegal?: boolean,
  ): void;
  dispose(): void;
}

function _makeFatLine(color: number): { line: Line2; geo: LineGeometry; mat: LineMaterial } {
  const mat = new LineMaterial({
    color,
    opacity: 0.9,
    transparent: true,
    linewidth: ASSIST_LINE_WIDTH,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });
  const geo = new LineGeometry();
  geo.setPositions([0, 0, 0, 0, 0, 0]);
  const line = new Line2(geo, mat);
  line.computeLineDistances();
  line.visible = false;
  return { line, geo, mat };
}

export function createGhostBall(scene: THREE.Scene): GhostBallVisual {
  // Ghost fill (cyan-white) + dark back-face outline for contrast in light ball stacks.
  const sphereGeo = new THREE.SphereGeometry(R, 16, 12);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: ASSIST_COLOR_LEGAL,
    transparent: true,
    opacity: GHOST_FILL_OPACITY,
    depthWrite: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.visible = false;
  scene.add(sphere);

  // Outline shell: slightly larger, rendered from inside so only the rim shows.
  const outlineGeo = new THREE.SphereGeometry(R * GHOST_OUTLINE_SCALE, 16, 12);
  const outlineMat = new THREE.MeshBasicMaterial({
    color: ASSIST_COLOR_OUTLINE,
    transparent: true,
    opacity: 0.85,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  outline.visible = false;
  scene.add(outline);

  // Two fat Line2 arms: cue-deflect + target line-of-centers
  const deflect = _makeFatLine(ASSIST_COLOR_LEGAL);
  const target  = _makeFatLine(ASSIST_COLOR_LEGAL);
  scene.add(deflect.line);
  scene.add(target.line);

  // Pocket highlight disc (flat ring at felt)
  const pocketGeo = new THREE.RingGeometry(
    POCKET_HIGHLIGHT_RADIUS * 0.55,
    POCKET_HIGHLIGHT_RADIUS,
    32,
  );
  const pocketMat = new THREE.MeshBasicMaterial({
    color: ASSIST_COLOR_LEGAL,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pocketRing = new THREE.Mesh(pocketGeo, pocketMat);
  pocketRing.rotation.x = -Math.PI / 2;
  pocketRing.visible = false;
  scene.add(pocketRing);

  function _setColor(legal: boolean): void {
    const c = legal ? ASSIST_COLOR_LEGAL : ASSIST_COLOR_ILLEGAL;
    sphereMat.color.setHex(c);
    // Outline stays near-black for both states (rim reads on red fill too).
    outlineMat.color.setHex(ASSIST_COLOR_OUTLINE);
    deflect.mat.color.setHex(c);
    target.mat.color.setHex(c);
    pocketMat.color.setHex(c);
  }

  function _onResize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    deflect.mat.resolution.set(w, h);
    target.mat.resolution.set(w, h);
  }
  window.addEventListener('resize', _onResize);

  return {
    update(cueBallPos: CmVector, hit: AimHit | null, powerFraction = 1, isLegal = true): void {
      if (!hit || hit.hitType === 'none') {
        sphere.visible = false;
        outline.visible = false;
        deflect.line.visible = false;
        target.line.visible = false;
        pocketRing.visible = false;
        return;
      }

      _setColor(isLegal);

      const g = ghostCenter(hit);
      sphere.position.set(g.x, g.y, g.z);
      outline.position.set(g.x, g.y, g.z);
      // Show ghost for both ball and cushion hits (Unity hitSphere always at contact)
      sphere.visible = true;
      outline.visible = true;

      // SP-Harden-10: fixed length = slider A; powerFraction intentionally unused.
      void powerFraction;
      const linePts = computeSeparationLines(
        cueBallPos, hit,
        _lineDistanceM,
      );
      if (linePts) {
        // Arm 1: cue deflection [ghost → deflect_end]
        deflect.geo.setPositions([
          linePts[0].x, linePts[0].y, linePts[0].z,
          linePts[1].x, linePts[1].y, linePts[1].z,
        ]);
        deflect.line.computeLineDistances();
        // Hide zero-length deflect arm on head-on shots
        const dLen = Math.hypot(linePts[1].x - linePts[0].x, linePts[1].z - linePts[0].z);
        deflect.line.visible = dLen > 1e-4;

        // Arm 2: target line-of-centers [ghost → target_end] — CEO key visual
        target.geo.setPositions([
          linePts[2].x, linePts[2].y, linePts[2].z,
          linePts[3].x, linePts[3].y, linePts[3].z,
        ]);
        target.line.computeLineDistances();
        target.line.visible = true;

        // Pocket highlight when target path points into a pocket.
        // SP-Harden-10 DIV: geometry-only (no powerFraction / isEnoughEnergy gate).
        const pk = nearestPocketAlongTarget(linePts[3]);
        if (pk) {
          pocketRing.position.set(pk.x, pk.y, pk.z);
          pocketRing.visible = true;
        } else {
          pocketRing.visible = false;
        }
      } else {
        // Cushion / non-ball: no separation arms
        deflect.line.visible = false;
        target.line.visible = false;
        pocketRing.visible = false;
      }
    },

    dispose(): void {
      window.removeEventListener('resize', _onResize);
      scene.remove(sphere);
      scene.remove(outline);
      scene.remove(deflect.line);
      scene.remove(target.line);
      scene.remove(pocketRing);
      sphereGeo.dispose();
      sphereMat.dispose();
      outlineGeo.dispose();
      outlineMat.dispose();
      deflect.geo.dispose();
      deflect.mat.dispose();
      target.geo.dispose();
      target.mat.dispose();
      pocketGeo.dispose();
      pocketMat.dispose();
    },
  };
}
