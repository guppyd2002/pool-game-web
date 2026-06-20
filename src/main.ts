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
const aimLine = createAimLine(scene.scene);
const powerBar = createPowerBar(container);
const cueMesh = createCueMesh(scene.scene);

let _lastAimTime = 0;

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
    aimLine.update(cueBall.position, hit);
    powerBar.update(cue.getPowerFraction());

    // CUE-001/016: derive aim direction from hit.point - cueBall.position
    const aimDir = hit
      ? new CmVector(
          hit.point.x - cueBall.position.x,
          0,
          hit.point.z - cueBall.position.z,
        )
      : null;
    cueMesh.update(cueBall.position, aimDir, dt);
  },
  onZoom: (delta) => {
    const dir = scene.camera.position.clone().normalize();
    scene.camera.position.addScaledVector(dir, -delta * 0.5);
    scene.camera.position.clampLength(1.0, 5.0);
  },
});
window.addEventListener('beforeunload', () => {
  adapter.dispose();
  aimLine.dispose();
  powerBar.dispose();
  cueMesh.dispose();
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
