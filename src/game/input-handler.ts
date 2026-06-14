/**
 * Input handler — click-drag on cue ball to shoot.
 * Direction: from release point to ball (ball pushes away from drag).
 * Force: proportional to drag distance.
 */

import * as THREE from 'three';
import type { Fixed } from '../physics/fixed-math';
import { MULTIPLIER, fromFloat } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';

// Max impulse (corresponds to MaxVelocity = 65000 in physics)
const MAX_FORCE: Fixed = 65000;
// Drag distance (in world units) that maps to max force
const MAX_DRAG = 1.5;

export function createInputHandler(
  camera: THREE.Camera,
  tableElement: HTMLElement,
  ballsMeshes: THREE.Mesh[],
  onShot: (direction: CmVector, force: Fixed) => void,
) {
  let enabled = true;
  let dragging = false;
  let startPos = new THREE.Vector2();

  const raycaster = new THREE.Raycaster();

  /** Get normalized device coordinates from mouse event */
  function getNDC(e: MouseEvent): THREE.Vector2 {
    const rect = tableElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** Project mouse to table plane (y=0.028 for ball center height) */
  function getTablePoint(ndc: THREE.Vector2): THREE.Vector3 | null {
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.028);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, target);
    return hit;
  }

  function onPointerDown(e: MouseEvent) {
    if (!enabled) return;
    const ndc = getNDC(e);

    // Check if clicking on cue ball (ball 0)
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(ballsMeshes[0]);
    if (hits.length > 0) {
      dragging = true;
      startPos.copy(ndc);
      e.preventDefault();
    }
  }

  function onPointerUp(e: MouseEvent) {
    if (!dragging) return;
    dragging = false;

    const endNDC = getNDC(e);
    const startPoint = getTablePoint(startPos);
    const endPoint = getTablePoint(endNDC);
    if (!startPoint || !endPoint) return;

    // Direction: from end to start (ball goes opposite to drag)
    const dx = startPoint.x - endPoint.x;
    const dz = startPoint.z - endPoint.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return; // too short, ignore

    // Normalize direction
    const nx = dx / dist;
    const nz = dz / dist;

    // Force proportional to distance, clamped
    const forceMag = Math.min(dist / MAX_DRAG, 1.0) * MAX_FORCE;
    const direction = new CmVector(
      fromFloat(nx),
      0,
      fromFloat(nz),
    );
    onShot(direction, Math.trunc(forceMag));
  }

  tableElement.addEventListener('pointerdown', onPointerDown);
  tableElement.addEventListener('pointerup', onPointerUp);

  return {
    enable() { enabled = true; },
    disable() { enabled = false; },
    dispose() {
      tableElement.removeEventListener('pointerdown', onPointerDown);
      tableElement.removeEventListener('pointerup', onPointerUp);
    },
  };
}
