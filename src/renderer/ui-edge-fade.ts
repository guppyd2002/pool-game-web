/**
 * CUE-021: UI edge fade — reduces overlay opacity when the table overlaps UI elements.
 *
 * C# source: CueManager.CheckUIPoint()
 *   deltaY = (uiDownPoint.position.y - GetUpperTablePointY()) / Screen.height
 *   if (deltaY <= 0): alpha = Mathf.Lerp(1f, 0.1f, -20f * deltaY)  [Unity clamps t to [0,1]]
 *   else:             alpha = 1f
 *
 * Web (CSS Y-down vs Unity Y-up):
 *   deltaY = (tableTopCssY - uiBottomCssY) / screenHeight
 *   Full fade (0.1) when overlap ≥ 5% of screen height.
 */

import * as THREE from 'three';
import { POCKET_POSITIONS } from '../physics/constants';
import { MULTIPLIER } from '../physics/fixed-math';

/**
 * Compute UI overlay alpha from CSS-coordinate inputs.
 * Pure function — exported for unit testing.
 *
 * @param uiBottomCssY  Bottom edge of UI overlay in CSS pixels (Y=0 at top of screen).
 * @param tableTopCssY  Topmost pocket CSS Y (smallest = highest on screen).
 * @param screenHeight  Window height in CSS pixels.
 * @returns Alpha ∈ [0.1, 1.0].
 */
export function computeUIAlpha(
  uiBottomCssY: number,
  tableTopCssY: number,
  screenHeight: number,
): number {
  // C#: deltaY = (uiDownPointY - upperTableY) / screenH  (Unity Y-up)
  // CSS: same magnitude, sign inverted → deltaY = (tableTopCssY - uiBottomCssY) / screenH
  const deltaY = (tableTopCssY - uiBottomCssY) / screenHeight;
  if (deltaY <= 0) {
    const t = Math.max(0, Math.min(1, -20 * deltaY));  // Unity Lerp clamps t
    return 1 - 0.9 * t;  // Lerp(1, 0.1, t)
  }
  return 1.0;
}

// ─── Three.js wrapper (browser-only, not unit-tested) ────────────────────────

export interface UIEdgeFade {
  dispose(): void;
}

/**
 * Runs a rAF loop that projects pocket positions to screen space each frame,
 * reads the bottom edge of each overlay element, and updates element opacity.
 */
export function createUIEdgeFade(
  camera: THREE.Camera,
  elements: HTMLElement[],
): UIEdgeFade {
  let frameId = -1;

  // Reuse single Vector3 to avoid GC pressure in the rAF loop.
  const _v = new THREE.Vector3();

  function frame(): void {
    const h = window.innerHeight;

    // Topmost pocket CSS Y: iterate all 6 pockets, take the minimum CSS Y (= highest on screen).
    let tableTopCssY = Infinity;
    for (const [px, pz] of POCKET_POSITIONS) {
      _v.set(px / MULTIPLIER, 0, pz / MULTIPLIER);
      _v.project(camera);
      // NDC Y=+1 → CSS Y=0 (top); NDC Y=-1 → CSS Y=h (bottom)
      const cssY = (1 - _v.y) / 2 * h;
      if (cssY < tableTopCssY) tableTopCssY = cssY;
    }

    // Bottom of all UI overlay elements (max CSS Y = lowest element edge on screen).
    let uiBottomCssY = 0;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.bottom > uiBottomCssY) uiBottomCssY = r.bottom;
    }

    const alpha = computeUIAlpha(uiBottomCssY, tableTopCssY, h);
    const alphaStr = String(alpha);
    for (const el of elements) {
      if (el.style.opacity !== alphaStr) el.style.opacity = alphaStr;
    }

    frameId = requestAnimationFrame(frame);
  }

  frameId = requestAnimationFrame(frame);

  return {
    dispose(): void {
      cancelAnimationFrame(frameId);
    },
  };
}
