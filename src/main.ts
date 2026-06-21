/**
 * Pool Game Web — main entry point.
 * Integrates: Three.js scene + IBallPoolPhysics + CueController + CueAdapter + multiplayer.
 *
 * Architecture (P1-T02):
 *   createPoolTable() → CmSpace
 *   createBallPoolPhysics(space, scene) → IBallPoolPhysics (G6 interface)
 *   createCueController(physics)        → cue UX logic (CUE-006/012, MON-018)
 *   createCueAdapter(...)               → DOM → CueController bridge
 *
 * No physics quantities are computed in this file — all routes through IBallPoolPhysics.
 */

import { createScene } from './renderer/scene';
import { createPoolTable } from './game/table-setup';
import { createBallPoolPhysics } from './game/ball-pool-physics';
import { createCueController } from './game/cue-controller';
import { createCueAdapter } from './game/cue-adapter';
import { createAimLine } from './renderer/aim-line';
import { createPowerBar } from './renderer/power-bar';
import { createCueMesh } from './renderer/cue-mesh';
import { createGhostBall } from './renderer/ghost-ball';
import { createPlacementMarker } from './renderer/placement-marker';
import { createBallInHandController } from './game/ball-in-hand';
import { tableIntersection, TABLE_PLANE_Y } from './game/cue-adapter';
import { createWSClient } from './network/ws-client';
import type { ShotPayload } from './network/ws-client';
import { CmVector } from './physics/cm-vector';
import { MULTIPLIER } from './physics/fixed-math';
import { backswingOffset } from './game/shot-animation';
import { createShotSlider } from './game/shot-slider';
import { createSpinDisc } from './game/spin-disc';
import { createSpinDiscUI } from './renderer/spin-disc-ui';
import { createPowerSliderUI } from './renderer/power-slider-ui';
import { createUIEdgeFade } from './renderer/ui-edge-fade';
import * as THREE from 'three';

// ─── Initialize ──────────────────────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = createScene(container);
const space = createPoolTable();
const physics = createBallPoolPhysics(space, scene);

// ─── Cue control (P1-T02) ────────────────────────────────────────────────────

const cue = createCueController(physics);
const aimLine = createAimLine(scene.scene);
const powerBar = createPowerBar(container);
const cueMesh = createCueMesh(scene.scene);
const ghostBall = createGhostBall(scene.scene);

// CUE-013 + CUE-014: ball-in-hand mechanism (triggered by P1-T03 rules)
const ballInHand = createBallInHandController(physics, 0);
const placementMarker = createPlacementMarker(scene.scene);
const _bihRaycaster = new THREE.Raycaster();
let _bihStartT = 0;

let _lastAimTime = 0;
// CUE-011: saved for punch animation after drag state is cleared
let _punchSavedAimDir: CmVector | null = null;
let _punchSavedCueBallPos: CmVector | null = null;

const adapter = createCueAdapter({
  camera: scene.camera,
  element: scene.renderer.domElement,
  cueBallMesh: scene.balls[0],
  controller: cue,
  onAimUpdate: () => {
    const now = performance.now() / 1000;
    const dt = _lastAimTime === 0 ? 0.016 : Math.min(now - _lastAimTime, 0.1);
    _lastAimTime = now;

    const cueBall = physics.getBall(0);
    const hit = cue.getAimHit();
    const power = cue.getPowerFraction();
    // CUE-008: aim line + ghost ball only shown when toggle is on
    aimLine.update(cueBall.position, cue.aimLineVisible ? hit : null);
    ghostBall.update(cueBall.position, cue.aimLineVisible ? hit : null, power);
    powerBar.update(power);

    // CUE-001/016: derive aim direction from hit.point - cueBall.position
    const aimDir = hit
      ? new CmVector(
          hit.point.x - cueBall.position.x,
          0,
          hit.point.z - cueBall.position.z,
        )
      : null;

    // CUE-011: save for punch animation loop (drag state will be cleared by onDragEnd)
    if (aimDir) {
      _punchSavedAimDir = aimDir;
      _punchSavedCueBallPos = cueBall.position;
    }

    cueMesh.update(cueBall.position, aimDir, dt, cue.getVerticalAngle(), power);
  },
  // CUE-011: on shot fire, animate cue punch then hide
  onShotFired: (power) => {
    if (!_punchSavedAimDir || !_punchSavedCueBallPos) return;
    // Assign after null-check so TypeScript infers CmVector (not CmVector|null)
    const savedDir = _punchSavedAimDir;
    const savedPos = _punchSavedCueBallPos;

    let punchDone = false;
    let lastTs = 0;
    cueMesh.startPunchAnimation(backswingOffset(power), () => { punchDone = true; });

    function punchFrame(ts: number): void {
      if (punchDone) return;
      const dt = lastTs === 0 ? 0.016 : Math.min((ts - lastTs) / 1000, 0.1);
      lastTs = ts;
      cueMesh.update(savedPos, savedDir, dt, 0, 0);
      if (!punchDone) requestAnimationFrame(punchFrame);
    }
    requestAnimationFrame(punchFrame);
  },
  onZoom: (delta) => {
    const dir = scene.camera.position.clone().normalize();
    scene.camera.position.addScaledVector(dir, -delta * 0.5);
    scene.camera.position.clampLength(1.0, 5.0);
  },
});

// CUE-002: power slider (after adapter so closures can reference it)
const shotSlider = createShotSlider({
  onStartControl: () => { adapter.disable(); },  // CUE-019 mutex: slider drag → no aim drag
  onEndControl:   () => { adapter.enable(); },
  onMove:  (f) => { powerBar.update(f); },
  onShot:  (f) => { cue.fireNow(f); },
});
const powerSliderUI = createPowerSliderUI(container, shotSlider);

// CUE-006/CUE-008: spin disc (after adapter so closures can reference it)
const spinDisc = createSpinDisc({
  onOpen:  () => { adapter.disable(); },  // CUE-019 mutex: disc open → no aim drag
  onClose: () => { adapter.enable(); },
  onSpinChange: (x, y) => cue.setSpinOffset(x, y),
});
const spinDiscUI = createSpinDiscUI(container, spinDisc);

// CUE-021: UI edge fade — fades all overlays when table pockets are above them in screen.
// Must be after all UI elements are created so their .element refs are valid.
const uiEdgeFade = createUIEdgeFade(scene.camera, [
  powerBar.element,
  powerSliderUI.element,
  spinDiscUI.element,
]);

// ─── Ball-in-hand pointer handling (CUE-013) ─────────────────────────────────
// Active only while ballInHand.isActive. Trigger (enter) is wired by P1-T03 rules.

function _bihNdcToTable(clientX: number, clientY: number): { x: number; z: number } | null {
  const rect = scene.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  _bihRaycaster.setFromCamera(ndc, scene.camera);
  return tableIntersection(_bihRaycaster, TABLE_PLANE_Y);
}

function onBihPointerMove(e: PointerEvent): void {
  if (!ballInHand.isActive) return;
  const pt = _bihNdcToTable(e.clientX, e.clientY);
  if (pt) ballInHand.move(pt.x, pt.z);
  const t = performance.now() / 1000 - _bihStartT;
  placementMarker.update(ballInHand.proposedPosition, ballInHand.proposedIsFree, t);
}

function onBihPointerUp(_e: PointerEvent): void {
  if (!ballInHand.isActive) return;
  if (ballInHand.commit()) {
    placementMarker.update(null, false, 0);
    adapter.enable();
  }
}

/** Called by game rules (P1-T03) to enter ball-in-hand mode. */
export function enterBallInHand(): void {
  adapter.disable();
  _bihStartT = performance.now() / 1000;
  ballInHand.enter();
  const t = performance.now() / 1000 - _bihStartT;
  placementMarker.update(ballInHand.proposedPosition, ballInHand.proposedIsFree, t);
}

const _canvas = scene.renderer.domElement;
_canvas.addEventListener('pointermove', onBihPointerMove as EventListener);
_canvas.addEventListener('pointerup', onBihPointerUp as EventListener);

window.addEventListener('beforeunload', () => {
  _canvas.removeEventListener('pointermove', onBihPointerMove as EventListener);
  _canvas.removeEventListener('pointerup', onBihPointerUp as EventListener);
  adapter.dispose();
  aimLine.dispose();
  ghostBall.dispose();
  powerSliderUI.dispose();
  spinDiscUI.dispose();
  uiEdgeFade.dispose();
  powerBar.dispose();
  cueMesh.dispose();
  placementMarker.dispose();
});

// ─── Multiplayer ─────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const room = params.get('room') || crypto.randomUUID();
if (!params.get('room')) {
  window.history.replaceState({}, '', `?room=${room}`);
}

const wsUrl = `ws://${window.location.hostname}:8080`;
const wsClient = createWSClient(wsUrl, room);

wsClient.connect().then(() => {
  console.log(`Connected to room: ${room}`);
}).catch((e) => {
  console.warn('Multiplayer not available:', e);
});

// ─── Remote shot (network → physics, bypass CueController) ───────────────────

wsClient.onShotReceived((data: ShotPayload) => {
  // Stop current replay, restore authoritative state, then apply remote shot
  physics.stop();
  physics.setStateFromString(data.ballsState);

  // Sync visual positions to restored physics state
  for (const body of space.rigidbodies) {
    scene.updateBallPosition(
      body.id,
      body.collider.position.x / MULTIPLIER,
      body.collider.position.y / MULTIPLIER,
      body.collider.position.z / MULTIPLIER,
    );
  }

  physics.start();

  // Reconstruct impulse from network payload (direction is Fixed unit vector + force scalar)
  const cueBall = physics.getBall(0);
  physics.applyShot({
    position: cueBall.position,
    impulse: new CmVector(
      Math.trunc((data.directionX * data.force) / MULTIPLIER),
      0,
      Math.trunc((data.directionZ * data.force) / MULTIPLIER),
    ),
    torque: CmVector.zero,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

physics.start();

// ─── Playwright / test hook ──────────────────────────────────────────────────
// Exposes minimal refs for headless browser smoke tests.
// NOT used in game logic — read-only from test scripts.
(window as unknown as Record<string, unknown>).__poolDebug = {
  camera: scene.camera,
  cueBallMesh: scene.balls[0],
  balls: scene.balls,         // all 16 meshes; .position gives scene-space XYZ
  renderer: scene.renderer,
  scene: scene.scene,         // THREE.Scene — needed for renderer.render(scene, camera)
};
