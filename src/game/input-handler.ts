/**
 * Input handler — unified pointer/touch/pinch/wheel input (INFRA-015 + INFRA-017).
 *
 * Desktop:  pointerdown/pointermove/pointerup + wheel (mouse wheel zoom)
 * Mobile:   PointerEvents for single-touch, TouchEvents for two-finger pinch
 *
 * C# equivalents: MouseInfo.cs (state machine) + ZoomManager.cs (pinch/wheel)
 * Pure logic is in unified-input.ts (PointerStateMachine); this file is the DOM adapter.
 */

import * as THREE from 'three';
import type { Fixed } from '../physics/fixed-math';
import { MULTIPLIER, fromFloat } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import { PointerStateMachine } from './unified-input';
import type { InputPoint } from './unified-input';

// Max impulse (corresponds to MaxVelocity = 65000 in physics)
const MAX_FORCE: Fixed = 65000;
// Drag distance (in world units) that maps to max force
const MAX_DRAG = 1.5;

export interface InputHandlerOptions {
  camera: THREE.Camera;
  element: HTMLElement;
  ballsMeshes: THREE.Mesh[];
  /** Called when cue ball is dragged and released with sufficient force. */
  onShot: (direction: CmVector, force: Fixed) => void;
  /** Called on pinch (mobile) or wheel (desktop) with normalized zoom delta (+ve = in). */
  onZoom?: (delta: number) => void;
  /** Called on pointer/touch move while dragging, for visual cue-stick feedback. */
  onDragMove?: (point: InputPoint) => void;
}

export function createInputHandler(options: InputHandlerOptions): {
  enable(): void;
  disable(): void;
  dispose(): void;
} {
  const { camera, element, ballsMeshes, onShot, onZoom, onDragMove } = options;

  let enabled = true;
  let dragging = false;
  let startNDC = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const sm = new PointerStateMachine();

  /** Convert client coords to Normalized Device Coordinates. */
  function toNDC(x: number, y: number): THREE.Vector2 {
    const rect = element.getBoundingClientRect();
    return new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** Project NDC onto table plane (y=0.028 = ball centre height). */
  function tablePoint(ndc: THREE.Vector2): THREE.Vector3 | null {
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.028);
    const target = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, target);
  }

  /** Compute shot and call onShot if drag distance is sufficient. */
  function fireShot(startNdc: THREE.Vector2, endNdc: THREE.Vector2): void {
    const startPt = tablePoint(startNdc);
    const endPt = tablePoint(endNdc);
    if (!startPt || !endPt) return;

    const dx = startPt.x - endPt.x;
    const dz = startPt.z - endPt.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return;

    const nx = dx / dist;
    const nz = dz / dist;
    const forceMag = Math.min(dist / MAX_DRAG, 1.0) * MAX_FORCE;
    onShot(new CmVector(fromFloat(nx), 0, fromFloat(nz)), Math.trunc(forceMag));
  }

  // ─── Pointer events (mouse + single-touch via PointerEvents API) ────────────

  function onPointerDown(e: PointerEvent): void {
    if (!enabled) return;
    const ndc = toNDC(e.clientX, e.clientY);

    // Only begin drag when clicking the cue ball (ball 0)
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(ballsMeshes[0]);
    if (hits.length === 0) return;

    sm.feedPointerDown(e.clientX, e.clientY);
    dragging = true;
    startNDC = ndc;
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging || !enabled) return;
    sm.feedPointerMove(e.clientX, e.clientY);
    onDragMove?.({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    const snap = sm.feedPointerUp(e.clientX, e.clientY);
    dragging = false;

    if (snap.phase === 'up' && enabled) {
      fireShot(startNDC, toNDC(e.clientX, e.clientY));
    }
  }

  // ─── Touch events for multi-finger pinch (INFRA-017) ───────────────────────

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
      // Two-finger: start pinch, cancel any drag in progress
      dragging = false;
      sm.feedTouchStart(pts);
      e.preventDefault();
    }
    // Single touch is handled by PointerEvents above
  }

  function onTouchMove(e: TouchEvent): void {
    if (!enabled) return;
    const pts = touchPoints(e);
    if (pts.length >= 2 && sm.isTwoTouch) {
      const result = sm.feedPinch([pts[0], pts[1]]);
      onZoom?.(result.zoomDelta);
      e.preventDefault();
    }
  }

  function onTouchEnd(e: TouchEvent): void {
    const pts = touchPoints(e);
    if (sm.isTwoTouch) {
      sm.feedTouchEnd(pts);
    }
  }

  // ─── Wheel (desktop zoom fallback, INFRA-017) ───────────────────────────────

  function onWheel(e: WheelEvent): void {
    if (!enabled) return;
    const result = sm.feedWheel(e.deltaY);
    onZoom?.(result.zoomDelta);
    e.preventDefault();
  }

  // ─── Register listeners ─────────────────────────────────────────────────────

  element.addEventListener('pointerdown', onPointerDown as EventListener);
  element.addEventListener('pointermove', onPointerMove as EventListener);
  element.addEventListener('pointerup', onPointerUp as EventListener);
  element.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
  element.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
  element.addEventListener('touchend', onTouchEnd as EventListener);
  element.addEventListener('wheel', onWheel as EventListener, { passive: false });

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      dragging = false;
      sm.reset();
    },
    dispose() {
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
