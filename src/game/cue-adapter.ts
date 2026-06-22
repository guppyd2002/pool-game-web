/**
 * P1-T02: CueAdapter — DOM → CueController bridge.
 *
 * Invariants (千手 P1-T02):
 *   1. DOM events never touch physics directly — all shots route through CueController.
 *   2. px/pointer coords are converted to world TablePoint (float meters) before
 *      entering the controller; the controller ensures all impulse values are Fixed.
 *   3. applyShot is only called via IBallPoolPhysics through CueController.onDragEnd.
 *   4. Unified pointer abstraction (P1-T12 PointerStateMachine) — no desktop/mobile split.
 *
 * tableIntersection() is extracted as a pure function for unit testing.
 */

import * as THREE from 'three';
import { PointerStateMachine } from './unified-input';
import type { InputPoint } from './unified-input';
import type { CueController } from './cue-controller';

/** Three.js world Y of the ball-center plane (= scene BALL_RADIUS = 0.028 m). */
export const TABLE_PLANE_Y = 0.028;

/**
 * Intersect a pre-aimed raycaster with a horizontal plane at world Y = planeY.
 * Returns null if the ray is parallel to the plane or pointing away from it.
 * Pure function — call raycaster.setFromCamera(ndc, camera) before invoking.
 */
export function tableIntersection(
  raycaster: THREE.Raycaster,
  planeY: number,
): { x: number; z: number } | null {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  return hit ? { x: target.x, z: target.z } : null;
}

export interface CueAdapterOptions {
  camera: THREE.Camera;
  /**
   * Optional: if provided, called at each raycasting event to resolve the current active camera.
   * Use this when the camera may switch between perspective and ortho (e.g. top-view toggle).
   * Overrides the static `camera` field for raycasting only.
   */
  getCameraFn?: () => THREE.Camera;
  element: HTMLElement;
  cueBallMesh: THREE.Mesh;
  controller: CueController;
  /** Called every drag-move tick — use to refresh aim-line visual (optional). */
  onAimUpdate?: () => void;
  /** Called on pinch or wheel zoom (delta > 0 = zoom in). */
  onZoom?: (delta: number) => void;
  /** CUE-011: Called when a shot fires, with the power fraction [0,1] at release. */
  onShotFired?: (powerFraction: number) => void;
}

export function createCueAdapter(opts: CueAdapterOptions): {
  enable(): void;
  disable(): void;
  dispose(): void;
} {
  const { element, cueBallMesh, controller } = opts;
  // Resolve the active camera at each raycasting call so ortho/perspective switches work correctly.
  const getCamera = opts.getCameraFn ?? (() => opts.camera);
  const sm = new PointerStateMachine();
  const raycaster = new THREE.Raycaster();
  let enabled = true;
  let dragging = false;
  // CUE-023: zoom-suspend flag — set during 2-finger pinch, cleared when fingers lift.
  // Independent of `enabled` (CUE-019 mutex). Cue input blocked when either is false.
  let _zoomActive = false;

  function toNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = element.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function ndcToTablePoint(ndc: THREE.Vector2): { x: number; z: number } | null {
    raycaster.setFromCamera(ndc, getCamera());
    return tableIntersection(raycaster, TABLE_PLANE_Y);
  }

  // ─── Pointer events (mouse + single-touch via PointerEvents API) ─────────────

  function onPointerDown(e: PointerEvent): void {
    if (!enabled || _zoomActive) return;  // CUE-023: block drag during pinch
    const ndc = toNDC(e.clientX, e.clientY);
    raycaster.setFromCamera(ndc, getCamera());
    // Only begin drag when the pointer hits the cue ball mesh
    if (raycaster.intersectObject(cueBallMesh).length === 0) return;

    sm.feedPointerDown(e.clientX, e.clientY);
    const pt = tableIntersection(raycaster, TABLE_PLANE_Y);
    if (!pt) return;
    dragging = true;
    controller.onDragStart(pt);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging || !enabled || _zoomActive) return;
    sm.feedPointerMove(e.clientX, e.clientY);
    const pt = ndcToTablePoint(toNDC(e.clientX, e.clientY));
    if (pt) {
      controller.onDragMove(pt);
      opts.onAimUpdate?.();
    }
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    sm.feedPointerUp(e.clientX, e.clientY);
    dragging = false;
    if (!enabled) return;
    const pt = ndcToTablePoint(toNDC(e.clientX, e.clientY));
    if (pt) {
      // CUE-011: capture power before onDragEnd clears drag state
      const powerAtRelease = controller.getPowerFraction();
      const shotFired = controller.onDragEnd(pt);
      if (shotFired) opts.onShotFired?.(powerAtRelease);
    } else {
      controller.cancel();  // pointer went off-table: cancel drag, clears aim line
    }
    opts.onAimUpdate?.();  // clear aim+power visuals when shot fires or drag drops
  }

  // ─── Touch events for multi-finger pinch (P1-T12 PointerStateMachine) ────────

  function touchPoints(e: TouchEvent): InputPoint[] {
    const pts: InputPoint[] = [];
    for (let i = 0; i < e.touches.length; i++) {
      pts.push({ x: e.touches[i].clientX, y: e.touches[i].clientY });
    }
    return pts;
  }

  function onTouchStart(e: TouchEvent): void {
    if (!enabled) return;
    const pts = touchPoints(e);
    if (pts.length >= 2) {
      // Two-finger: cancel any in-progress drag, start pinch
      dragging = false;
      controller.cancel();
      opts.onAimUpdate?.();  // clear aim visuals on two-finger interrupt
      _zoomActive = true;    // CUE-023: suspend cue input during zoom
      sm.feedTouchStart(pts);
      e.preventDefault();
    }
    // Single touch falls through to PointerEvents above
  }

  function onTouchMove(e: TouchEvent): void {
    if (!enabled) return;
    const pts = touchPoints(e);
    if (pts.length >= 2 && sm.isTwoTouch) {
      const result = sm.feedPinch([pts[0], pts[1]]);
      opts.onZoom?.(result.zoomDelta);
      e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    const pts = touchPoints(e);
    if (sm.isTwoTouch) {
      sm.feedTouchEnd(pts);
      _zoomActive = false;  // CUE-023: resume cue input when pinch ends
    }
  }

  // ─── Mouse wheel zoom (desktop, P1-T12) ──────────────────────────────────────

  function onWheel(e: WheelEvent): void {
    if (!enabled) return;
    const result = sm.feedWheel(e.deltaY);
    opts.onZoom?.(result.zoomDelta);
    e.preventDefault();
  }

  // ─── Register listeners ───────────────────────────────────────────────────────

  element.addEventListener('pointerdown', onPointerDown as EventListener);
  element.addEventListener('pointermove', onPointerMove as EventListener);
  element.addEventListener('pointerup', onPointerUp as EventListener);
  element.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
  element.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
  element.addEventListener('touchend', onTouchEnd as EventListener);
  element.addEventListener('wheel', onWheel as EventListener, { passive: false });

  return {
    enable(): void { enabled = true; },
    disable(): void { enabled = false; dragging = false; controller.cancel(); sm.reset(); },
    dispose(): void {
      element.removeEventListener('pointerdown', onPointerDown as EventListener);
      element.removeEventListener('pointermove', onPointerMove as EventListener);
      element.removeEventListener('pointerup', onPointerUp as EventListener);
      element.removeEventListener('touchstart', onTouchStart as EventListener);
      element.removeEventListener('touchmove', onTouchMove as EventListener);
      element.removeEventListener('touchend', onTouchEnd as EventListener);
      element.removeEventListener('wheel', onWheel as EventListener);
    },
  };
}
