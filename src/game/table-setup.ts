/**
 * Pool table setup — creates CmSpace with table geometry, balls, cushions, pockets.
 * Coordinates: x = table long axis, z = short axis, y = up.
 * All values in fixed-point (MULTIPLIER = 10000, so 1.0 = 10000).
 */

import { MULTIPLIER, fixPowSave } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from '../physics/colliders';
import { CmRigidbody, CmKinematicTrigger } from '../physics/cm-rigidbody';
import { CmSpace } from '../physics/cm-space';
import type { CmSpaceCube } from '../physics/cm-collision';

// ─── Table constants (fixed-point) ───────────────────────────────────────────

// Standard 8-ball: 2.54m × 1.27m → 25400 × 12700 in fixed
const TABLE_W = 25400;
const TABLE_H = 12700;
const BALL_RADIUS = 285; // 0.0285m → 285
const BALL_MASS = MULTIPLIER; // 1.0

// Material definitions
const ballMaterial = {
  bounciness: 9500,
  rollingFriction: 500,
  twistingFriction: 300,
  dynamicFriction: 2000,
  staticFriction: 4000,
};

const tableMaterial = {
  bounciness: 2000,
  rollingFriction: 800,
  twistingFriction: 500,
  dynamicFriction: 2500,
  staticFriction: 4000,
};

const cushionMaterial = {
  bounciness: 7000,
  rollingFriction: 1000,
  twistingFriction: 1000,
  dynamicFriction: 3000,
  staticFriction: 5000,
};

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeBall(pos: CmVector): CmRigidbody {
  const collider = new CmSphereCollider();
  collider.position = pos;
  collider.radius = BALL_RADIUS;
  collider.enabled = true;
  collider.scale = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  collider.material = { ...ballMaterial };
  const body = new CmRigidbody();
  body.mass = BALL_MASS;
  body.collider = collider;
  body.centreOfMass = CmVector.zero;
  return body;
}

/** Create the full pool table physics scene */
export function createPoolTable(): CmSpace {
  const spaceCube: CmSpaceCube = {
    position: CmVector.zero,
    scale: new CmVector(50000, 50000, 50000),
  };

  // ─── Balls (16) ────────────────────────────────────────────────────
  const bodies: CmRigidbody[] = [];
  const spacing = BALL_RADIUS * 2 + 5; // tiny gap

  // Cue ball at left 1/4
  bodies.push(makeBall(new CmVector(-Math.trunc(TABLE_W / 4), BALL_RADIUS, 0)));

  // Triangle rack at right 1/4
  const rackX = Math.trunc(TABLE_W / 4);
  const rowDx = Math.trunc(spacing * 866 / 1000); // cos(30°) ≈ 0.866
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = rackX + row * rowDx;
      const z = (col * 2 - row) * Math.trunc(spacing / 2);
      bodies.push(makeBall(new CmVector(x, BALL_RADIUS, z)));
    }
  }

  // ─── Table plane (y=0) ─────────────────────────────────────────────
  const colliders: (CmPlaneCollider | CmLineCollider)[] = [];

  const plane = new CmPlaneCollider();
  plane.position = CmVector.zero;
  plane.up = new CmVector(0, MULTIPLIER, 0);
  plane.right = new CmVector(MULTIPLIER, 0, 0);
  plane.forward = new CmVector(0, 0, MULTIPLIER);
  plane.scale = new CmVector(TABLE_W, 0, TABLE_H);
  plane.radius = Math.trunc(TABLE_W / 2);
  plane.enabled = true;
  plane.material = { ...tableMaterial };
  colliders.push(plane);

  // ─── Cushions (4 LineColliders along edges) ─────────────────────────
  const halfW = Math.trunc(TABLE_W / 2);
  const halfH = Math.trunc(TABLE_H / 2);
  const cushionY = BALL_RADIUS; // at ball center height

  // Top cushion (negative Z)
  const cTop = new CmLineCollider();
  cTop.position = new CmVector(0, cushionY, -halfH);
  cTop.right = new CmVector(MULTIPLIER, 0, 0); // along X
  cTop.up = new CmVector(0, MULTIPLIER, 0);
  cTop.forward = new CmVector(0, 0, MULTIPLIER); // normal points inward (+Z)
  cTop.scale = new CmVector(TABLE_W, 0, 0);
  cTop.radius = halfW;
  cTop.enabled = true;
  cTop.material = { ...cushionMaterial };
  colliders.push(cTop);

  // Bottom cushion (positive Z)
  const cBot = new CmLineCollider();
  cBot.position = new CmVector(0, cushionY, halfH);
  cBot.right = new CmVector(MULTIPLIER, 0, 0);
  cBot.up = new CmVector(0, MULTIPLIER, 0);
  cBot.forward = new CmVector(0, 0, -MULTIPLIER); // normal inward (-Z)
  cBot.scale = new CmVector(TABLE_W, 0, 0);
  cBot.radius = halfW;
  cBot.enabled = true;
  cBot.material = { ...cushionMaterial };
  colliders.push(cBot);

  // Left cushion (negative X)
  const cLeft = new CmLineCollider();
  cLeft.position = new CmVector(-halfW, cushionY, 0);
  cLeft.right = new CmVector(0, 0, MULTIPLIER); // along Z
  cLeft.up = new CmVector(0, MULTIPLIER, 0);
  cLeft.forward = new CmVector(MULTIPLIER, 0, 0); // normal inward (+X)
  cLeft.scale = new CmVector(TABLE_H, 0, 0);
  cLeft.radius = halfH;
  cLeft.enabled = true;
  cLeft.material = { ...cushionMaterial };
  colliders.push(cLeft);

  // Right cushion (positive X)
  const cRight = new CmLineCollider();
  cRight.position = new CmVector(halfW, cushionY, 0);
  cRight.right = new CmVector(0, 0, MULTIPLIER); // along Z
  cRight.up = new CmVector(0, MULTIPLIER, 0);
  cRight.forward = new CmVector(-MULTIPLIER, 0, 0); // normal inward (-X)
  cRight.scale = new CmVector(TABLE_H, 0, 0);
  cRight.radius = halfH;
  cRight.enabled = true;
  cRight.material = { ...cushionMaterial };
  colliders.push(cRight);

  // ─── Pockets (6 KinematicTriggers) ─────────────────────────────────
  const pocketRadius = 450; // slightly larger than ball
  const triggers: CmKinematicTrigger[] = [];
  const pocketPositions = [
    new CmVector(-halfW, BALL_RADIUS, -halfH), // top-left
    new CmVector(0, BALL_RADIUS, -halfH),       // top-center
    new CmVector(halfW, BALL_RADIUS, -halfH),   // top-right
    new CmVector(-halfW, BALL_RADIUS, halfH),   // bottom-left
    new CmVector(0, BALL_RADIUS, halfH),         // bottom-center
    new CmVector(halfW, BALL_RADIUS, halfH),     // bottom-right
  ];
  for (const pos of pocketPositions) {
    const trigger = new CmKinematicTrigger();
    trigger.position = pos;
    trigger.radius = pocketRadius;
    triggers.push(trigger);
  }

  // ─── Create space ──────────────────────────────────────────────────
  const space = new CmSpace();
  space.init(spaceCube, bodies, colliders, triggers);

  // Deactivate all balls initially (waiting for first shot)
  for (const body of space.rigidbodies) {
    body.isActive = false;
  }

  return space;
}
