/**
 * P1-T02: CueAdapter — tests for the pure tableIntersection helper.
 *
 * tableIntersection(raycaster, planeY) is the only testable unit of the adapter
 * in the Node environment (DOM event listeners require a browser).
 *
 * Invariant under test: screen px → NDC → world TablePoint conversion is
 * deterministic pure math.  The adapter never computes impulse quantities —
 * all physics computation is in CueController.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { tableIntersection, TABLE_PLANE_Y } from '../../game/cue-adapter';

// ─── Camera fixture: overhead view (camera at y=5, looking down) ──────────────

let camera: THREE.PerspectiveCamera;
let raycaster: THREE.Raycaster;

beforeEach(() => {
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  raycaster = new THREE.Raycaster();
});

describe('tableIntersection — NDC → world TablePoint', () => {
  it('center NDC (0,0) hits plane at approx (0, 0) for overhead camera', () => {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const pt = tableIntersection(raycaster, 0);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeCloseTo(0, 3);
    expect(pt!.z).toBeCloseTo(0, 3);
  });

  it('left NDC (-1, 0) hits plane at x < 0', () => {
    raycaster.setFromCamera(new THREE.Vector2(-1, 0), camera);
    const pt = tableIntersection(raycaster, 0);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeLessThan(0);
  });

  it('right NDC (1, 0) hits plane at x > 0', () => {
    raycaster.setFromCamera(new THREE.Vector2(1, 0), camera);
    const pt = tableIntersection(raycaster, 0);
    expect(pt).not.toBeNull();
    expect(pt!.x).toBeGreaterThan(0);
  });

  it('top NDC (0, 1) hits plane at z < 0 (screen up = world -z for overhead)', () => {
    raycaster.setFromCamera(new THREE.Vector2(0, 1), camera);
    const pt = tableIntersection(raycaster, 0);
    expect(pt).not.toBeNull();
    expect(pt!.z).toBeLessThan(0);
  });

  it('bottom NDC (0, -1) hits plane at z > 0', () => {
    raycaster.setFromCamera(new THREE.Vector2(0, -1), camera);
    const pt = tableIntersection(raycaster, 0);
    expect(pt).not.toBeNull();
    expect(pt!.z).toBeGreaterThan(0);
  });

  it('planeY offset shifts intersection consistently (center ray hits planeY, not y=0)', () => {
    // Camera at y=5, looking down at (0,0,0).
    // Center ray (NDC 0,0) hits y=0 at (0,0) and y=2 at (0,2) but same x,z.
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const pt0 = tableIntersection(raycaster, 0);
    const pt2 = tableIntersection(raycaster, 2);
    // For straight-down ray, x and z should both be ~0 regardless of planeY
    expect(pt0!.x).toBeCloseTo(0, 3);
    expect(pt2!.x).toBeCloseTo(0, 3);
  });

  it('returns null when ray cannot reach the plane (camera below plane, looking down)', () => {
    // Camera at y=1, plane at y=5. Downward ray moves to y<1 — can never reach y=5.
    const cam2 = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam2.position.set(0, 1, 0);
    cam2.lookAt(0, 0, 0);
    cam2.updateProjectionMatrix();
    cam2.updateMatrixWorld();
    const r2 = new THREE.Raycaster();
    r2.setFromCamera(new THREE.Vector2(0, 0), cam2);
    expect(tableIntersection(r2, 5)).toBeNull();
  });

  it('returns deterministic result for repeated calls with identical input', () => {
    raycaster.setFromCamera(new THREE.Vector2(0.5, -0.3), camera);
    const r1 = tableIntersection(raycaster, 0);
    const r2 = tableIntersection(raycaster, 0);
    expect(r1).not.toBeNull();
    expect(r1!.x).toBe(r2!.x);
    expect(r1!.z).toBe(r2!.z);
  });

  it('left-right symmetry: NDC (-x,0) and (x,0) produce mirror x coords', () => {
    raycaster.setFromCamera(new THREE.Vector2(-0.6, 0), camera);
    const ptL = tableIntersection(raycaster, 0);
    raycaster.setFromCamera(new THREE.Vector2(0.6, 0), camera);
    const ptR = tableIntersection(raycaster, 0);
    expect(ptL).not.toBeNull();
    expect(ptR).not.toBeNull();
    expect(ptL!.x).toBeCloseTo(-ptR!.x, 5);
    expect(ptL!.z).toBeCloseTo(ptR!.z, 5);
  });
});

describe('TABLE_PLANE_Y constant', () => {
  it('TABLE_PLANE_Y matches scene BALL_RADIUS (0.028 m)', () => {
    expect(TABLE_PLANE_Y).toBe(0.028);
  });
});
