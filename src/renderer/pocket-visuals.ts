/**
 * B2 — pocket hole visuals + ball sink animation.
 *
 * RENDER_POCKET_POSITIONS and RENDER_POCKET_RADIUS are derived from the same
 * sim constants (POCKET_POSITIONS / PHYSICS_MULTIPLIER) — single source of truth.
 * Never hardcode coordinates here; if the sim moves a pocket, visual must follow.
 */

import * as THREE from 'three';
import { POCKET_POSITIONS, POCKET_RADIUS, PHYSICS_MULTIPLIER } from '../physics/constants';

/**
 * Pocket positions in Three.js world space (meters).
 * Derived from POCKET_POSITIONS / PHYSICS_MULTIPLIER — identical to sim trigger zones.
 */
export const RENDER_POCKET_POSITIONS: ReadonlyArray<{ readonly x: number; readonly z: number }> =
  POCKET_POSITIONS.map(([x, z]) => ({ x: x / PHYSICS_MULTIPLIER, z: z / PHYSICS_MULTIPLIER }));

/** Pocket visual radius in meters (= sim POCKET_RADIUS / PHYSICS_MULTIPLIER). */
export const RENDER_POCKET_RADIUS: number = POCKET_RADIUS / PHYSICS_MULTIPLIER;

/**
 * Add 6 pocket hole disc meshes to `parent`.
 * Positions come from RENDER_POCKET_POSITIONS so render and sim stay aligned.
 */
export function createPocketMeshes(parent: THREE.Object3D): THREE.Mesh[] {
  const geo = new THREE.CircleGeometry(RENDER_POCKET_RADIUS, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const meshes: THREE.Mesh[] = [];

  for (const { x, z } of RENDER_POCKET_POSITIONS) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;  // lie flat on table surface
    mesh.position.set(x, 0.001, z);  // 1mm above felt to avoid z-fighting
    parent.add(mesh);
    meshes.push(mesh);
  }

  return meshes;
}

/**
 * Animate a ball sinking into the pocket: a temporary clone descends and fades out.
 * The original mesh must be hidden by the caller (scene.hideBall sets visible=false).
 */
export function animateBallSink(mesh: THREE.Mesh, threeScene: THREE.Scene): void {
  const srcMat = mesh.material;
  const color = srcMat instanceof THREE.MeshStandardMaterial
    ? srcMat.color.clone()
    : new THREE.Color(0xffffff);

  const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 1, roughness: 0.3 });
  const geo = new THREE.SphereGeometry(0.028, 16, 12);  // BALL_RADIUS = 0.028m
  const clone = new THREE.Mesh(geo, mat);
  clone.position.copy(mesh.position);
  threeScene.add(clone);

  const DURATION = 0.25;
  let elapsed = 0;
  let lastTs = 0;

  function tick(ts: number): void {
    const dt = lastTs === 0 ? 0 : Math.min((ts - lastTs) / 1000, 0.1);
    lastTs = ts;
    elapsed += dt;
    const t = Math.min(elapsed / DURATION, 1);
    clone.position.y = mesh.position.y - t * 0.05;  // sink 5cm into table
    mat.opacity = 1 - t;
    if (t >= 1) {
      threeScene.remove(clone);
      geo.dispose();
      mat.dispose();
    } else {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);
}
