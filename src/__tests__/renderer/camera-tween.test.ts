/**
 * B3 — camera-tween tests: POSE_TOP structural checks + tween behavior.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraTween, POSE_OVERVIEW, POSE_TABLE, POSE_TOP } from '../../renderer/camera-tween';

describe('camera-tween — B3', () => {

  describe('POSE_TOP structural invariants', () => {
    it('is exported with a 3-element position tuple', () => {
      expect(POSE_TOP.position).toHaveLength(3);
    });

    it('y is higher than POSE_TABLE (top view must be above playing view)', () => {
      expect(POSE_TOP.position[1]).toBeGreaterThan(POSE_TABLE.position[1]);
    });

    it('y >= POSE_OVERVIEW.y (at least as high as overview pose)', () => {
      expect(POSE_TOP.position[1]).toBeGreaterThanOrEqual(POSE_OVERVIEW.position[1]);
    });

    it('x is near 0 (top view is centered over table)', () => {
      expect(Math.abs(POSE_TOP.position[0])).toBeLessThan(0.5);
    });

    it('lookAt is [0,0,0]', () => {
      expect(POSE_TOP.lookAt).toEqual([0, 0, 0]);
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

    it('tweenTo POSE_TOP with duration=0 sets camera to top position', () => {
      const camera = new THREE.PerspectiveCamera();
      const tween = createCameraTween(camera);
      tween.tweenTo(POSE_TOP, 0);
      expect(camera.position.y).toBeCloseTo(POSE_TOP.position[1], 5);
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
      tween.tweenTo(POSE_TOP, 0);
      expect(tween.isActive).toBe(false);
    });
  });

});
