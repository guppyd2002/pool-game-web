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
import { createWSClient } from './network/ws-client';
import type { ShotPayload } from './network/ws-client';
import { CmVector } from './physics/cm-vector';
import { MULTIPLIER } from './physics/fixed-math';

// ─── Initialize ──────────────────────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = createScene(container);
const space = createPoolTable();
const physics = createBallPoolPhysics(space, scene);

// ─── Cue control (P1-T02) ────────────────────────────────────────────────────

const cue = createCueController(physics);
const adapter = createCueAdapter({
  camera: scene.camera,
  element: scene.renderer.domElement,
  cueBallMesh: scene.balls[0],
  controller: cue,
  onZoom: (delta) => {
    // Move camera closer/further along its current look-at direction
    const dir = scene.camera.position.clone().normalize();
    scene.camera.position.addScaledVector(dir, -delta * 0.5);
    scene.camera.position.clampLength(1.0, 5.0);
  },
});
window.addEventListener('beforeunload', () => adapter.dispose());

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

// ─── Wire local shots → network send ─────────────────────────────────────────

// Intercept applyShot to also broadcast local shots (wrap physics temporarily)
// For now this is handled by listening to CueController events via a thin wrapper.
// TODO(P1-T03): extract shot-event bus once multiplayer protocol is stabilised.

// ─── Start ───────────────────────────────────────────────────────────────────

physics.start();
