/**
 * Pool Game Web — main entry point.
 * Integrates: Three.js scene + physics (CmSpace) + input + multiplayer.
 */

import { createScene } from './renderer/scene';
import { createPoolTable } from './game/table-setup';
import { createSimulationLoop } from './game/simulation-loop';
import { createInputHandler } from './game/input-handler';
import { createWSClient } from './network/ws-client';
import type { ShotPayload } from './network/ws-client';
import { CmVector } from './physics/cm-vector';
import type { Fixed } from './physics/fixed-math';
import { MULTIPLIER } from './physics/fixed-math';
import { CmForceMode } from './physics/cm-rigidbody';

// ─── Initialize ──────────────────────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = createScene(container);
const space = createPoolTable();
const sim = createSimulationLoop(space, scene);

// ─── Multiplayer ─────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const room = params.get('room') || crypto.randomUUID();
// Update URL with room if generated
if (!params.get('room')) {
  window.history.replaceState({}, '', `?room=${room}`);
}

const wsUrl = `ws://${window.location.hostname}:8080`;
const wsClient = createWSClient(wsUrl, room);

// Connect (non-blocking, log errors)
wsClient.connect().then(() => {
  console.log(`Connected to room: ${room}`);
}).catch((e) => {
  console.warn('Multiplayer not available:', e);
});

// ─── Apply shot (shared logic) ───────────────────────────────────────────────

function applyShot(directionX: number, directionZ: number, force: number, isRemote = false) {
  // Only block local shots during simulation; remote shots always apply (with state reset)
  if (!isRemote && sim.isSimulating) return;

  const impulse = new CmVector(
    Math.trunc((directionX * force) / MULTIPLIER),
    0,
    Math.trunc((directionZ * force) / MULTIPLIER),
  );

  sim.applyShot({
    position: space.rigidbodies[0].collider.position,
    impulse,
    torque: CmVector.zero,
  });
}

// ─── Input → Local shot + send to network ────────────────────────────────────

const input = createInputHandler(
  scene.camera,
  scene.renderer.domElement,
  scene.balls,
  (direction: CmVector, force: Fixed) => {
    if (sim.isSimulating) return;

    // Get current state snapshot BEFORE applying shot
    const ballsState = space.getStringState();

    // Apply locally
    applyShot(direction.x, direction.z, force);

    // Send to remote
    wsClient.sendShot({
      force,
      directionX: direction.x,
      directionZ: direction.z,
      ballsState,
    });
  },
);

// ─── Receive remote shot ─────────────────────────────────────────────────────

wsClient.onShotReceived((data: ShotPayload) => {
  // Stop current simulation
  sim.stop();

  // Restore state snapshot (ensures deterministic replay)
  space.setStateFromString(data.ballsState, null);

  // Sync visual positions to restored state
  for (const body of space.rigidbodies) {
    scene.updateBallPosition(
      body.id,
      body.collider.position.x / MULTIPLIER,
      body.collider.position.y / MULTIPLIER,
      body.collider.position.z / MULTIPLIER,
    );
  }

  // Restart sim loop and apply the remote shot
  sim.start();
  applyShot(data.directionX, data.directionZ, data.force, true);
});

// ─── Start ───────────────────────────────────────────────────────────────────

sim.start();
