/**
 * Pool Game Web — main entry point.
 * Integrates: Three.js scene + physics (CmSpace) + input handling.
 */

import { createScene } from './renderer/scene';
import { createPoolTable } from './game/table-setup';
import { createSimulationLoop } from './game/simulation-loop';
import { createInputHandler } from './game/input-handler';
import { CmVector } from './physics/cm-vector';
import type { Fixed } from './physics/fixed-math';
import { MULTIPLIER } from './physics/fixed-math';

// ─── Initialize ──────────────────────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = createScene(container);
const space = createPoolTable();
const sim = createSimulationLoop(space, scene);

// ─── Input → Shot ────────────────────────────────────────────────────────────

const input = createInputHandler(
  scene.camera,
  scene.renderer.domElement,
  scene.balls,
  (direction: CmVector, force: Fixed) => {
    if (sim.isSimulating) return; // wait for current shot to finish

    // impulse = direction * force / MULTIPLIER (scale direction by force magnitude)
    const impulse = new CmVector(
      Math.trunc((direction.x * force) / MULTIPLIER),
      0,
      Math.trunc((direction.z * force) / MULTIPLIER),
    );

    sim.applyShot({
      position: space.rigidbodies[0].collider.position,
      impulse,
      torque: CmVector.zero,
    });
  },
);

// ─── Start ───────────────────────────────────────────────────────────────────

sim.start();
