/**
 * CUE-014: ball-in-hand placement marker — breathing ring visual.
 *
 * Shows a flat ring at the proposed ball position:
 *   - Green when positionIsFree, red when occupied
 *   - "Breathing" pulse: scale oscillates at 2Hz ±15%
 *
 * markerPulseScale() is exported for unit testing (pure, no Three.js).
 */

import * as THREE from 'three';
import type { CmVector } from '../physics/cm-vector';
import { MULTIPLIER } from '../physics/fixed-math';
import { BALL_RADIUS } from '../physics/constants';

// ─── Pure helper (exported for testing) ──────────────────────────────────────

/**
 * Scale factor for the breathing animation at time `t` (seconds).
 * Oscillates between (1-amp) and (1+amp) at `freq` cycles per second.
 */
export function markerPulseScale(t: number, freq: number, amp: number): number {
  return 1 + amp * Math.sin(t * freq * Math.PI * 2);
}

// ─── Three.js marker (not unit-tested) ───────────────────────────────────────

const R = (BALL_RADIUS / MULTIPLIER) * 1.6;  // ring slightly larger than ball radius
const PULSE_FREQ = 2;   // Hz
const PULSE_AMP = 0.15; // ±15%

export interface PlacementMarkerController {
  /** Call each frame with current proposed position (or null to hide). */
  update(pos: CmVector | null, isFree: boolean, t: number): void;
  dispose(): void;
}

export function createPlacementMarker(scene: THREE.Scene): PlacementMarkerController {
  const geo = new THREE.RingGeometry(R * 0.65, R, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;  // lay flat on table plane
  scene.add(ring);
  ring.visible = false;

  return {
    update(pos: CmVector | null, isFree: boolean, t: number): void {
      if (!pos) {
        ring.visible = false;
        return;
      }
      ring.visible = true;
      ring.position.set(
        pos.x / MULTIPLIER,
        pos.y / MULTIPLIER + 0.001,  // hair above table to avoid z-fighting
        pos.z / MULTIPLIER,
      );
      mat.color.set(isFree ? 0x00ff00 : 0xff4444);
      const s = markerPulseScale(t, PULSE_FREQ, PULSE_AMP);
      ring.scale.set(s, s, s);
    },

    dispose(): void {
      scene.remove(ring);
      geo.dispose();
      mat.dispose();
    },
  };
}
