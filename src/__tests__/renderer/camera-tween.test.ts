/**
 * B3 — camera-tween tests: POSE_OVERVIEW/POSE_TABLE structural checks + tween behavior.
 * Note: POSE_TOP removed — 'T' key now triggers scene.setOrthoTop() (OrthographicCamera).
 * See scene.ts orthoFrustum + SceneAPI.setOrthoTop for the new top-down implementation.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraTween, POSE_OVERVIEW, POSE_TABLE } from '../../renderer/camera-tween';

describe('camera-tween — B3', () => {

  describe('POSE_OVERVIEW / POSE_TABLE structural invariants', () => {
    it('POSE_OVERVIEW has a 3-element position tuple', () => {
      expect(POSE_OVERVIEW.position).toHaveLength(3);
    });

    it('POSE_TABLE y is below POSE_OVERVIEW y (table view is closer to table)', () => {
      expect(POSE_TABLE.position[1]).toBeLessThan(POSE_OVERVIEW.position[1]);
    });

    it('POSE_TABLE is centered over table (x ≈ 0)', () => {
      expect(Math.abs(POSE_TABLE.position[0])).toBeLessThan(0.5);
    });

    it('POSE_OVERVIEW lookAt is [0,0,0]', () => {
      expect(POSE_OVERVIEW.lookAt).toEqual([0, 0, 0]);
    });

    it('POSE_TABLE lookAt is [0,0,0]', () => {
      expect(POSE_TABLE.lookAt).toEqual([0, 0, 0]);
    });
  });

  describe('tweenTo + update', () => {
    it('tweenTo with duration=0 immediately sets camera position', () => {
      const camera = new THREE.PerspectiveCamera();
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_TABLE, 0);
      expect(camera.position.x).toBeCloseTo(POSE_TABLE.position[0], 5);
      expect(camera.position.y).toBeCloseTo(POSE_TABLE.position[1], 5);
      expect(camera.position.z).toBeCloseTo(POSE_TABLE.position[2], 5);
    });

    it('tweenTo POSE_OVERVIEW with duration=0 sets camera to overview position', () => {
      const camera = new THREE.PerspectiveCamera();
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_OVERVIEW, 0);
      expect(camera.position.y).toBeCloseTo(POSE_OVERVIEW.position[1], 5);
    });

    it('update() advances position toward target (not yet at target)', () => {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 0, 0);
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_TABLE, 1.0);
      expect(tween.isActive).toBe(true);
      tween.update(0.5);
      expect(camera.position.y).toBeGreaterThan(0);
      expect(camera.position.y).toBeLessThan(POSE_TABLE.position[1]);
    });

    it('isActive becomes false when tween completes', () => {
      const camera = new THREE.PerspectiveCamera();
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_OVERVIEW, 0.5);
      tween.update(1.0);  // more than duration
      expect(tween.isActive).toBe(false);
    });

    it('isActive is false immediately after duration=0 tweenTo', () => {
      const camera = new THREE.PerspectiveCamera();
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_OVERVIEW, 0);
      expect(tween.isActive).toBe(false);
    });
  });

});
