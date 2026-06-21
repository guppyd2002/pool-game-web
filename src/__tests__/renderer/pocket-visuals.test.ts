/**
 * B2 — pocket-visuals anti-drift contract.
 *
 * Render pocket positions MUST equal sim POCKET_POSITIONS / PHYSICS_MULTIPLIER.
 * If someone hardcodes a visual coordinate, these tests will catch the drift
 * (same failure mode as the rack-positions self-referential golden incident).
 */

import { describe, it, expect } from 'vitest';
import { RENDER_POCKET_POSITIONS, RENDER_POCKET_RADIUS } from '../../renderer/pocket-visuals';
import { POCKET_POSITIONS, POCKET_RADIUS, PHYSICS_MULTIPLIER } from '../../physics/constants';

describe('pocket-visuals — B2', () => {

  describe('RENDER_POCKET_POSITIONS matches sim POCKET_POSITIONS (anti-drift)', () => {
    for (let i = 0; i < POCKET_POSITIONS.length; i++) {
      it(`pocket[${i}] x === POCKET_POSITIONS[${i}][0] / PHYSICS_MULTIPLIER`, () => {
        expect(RENDER_POCKET_POSITIONS[i].x).toBe(POCKET_POSITIONS[i][0] / PHYSICS_MULTIPLIER);
      });
      it(`pocket[${i}] z === POCKET_POSITIONS[${i}][1] / PHYSICS_MULTIPLIER`, () => {
        expect(RENDER_POCKET_POSITIONS[i].z).toBe(POCKET_POSITIONS[i][1] / PHYSICS_MULTIPLIER);
      });
    }
  });

  it('RENDER_POCKET_RADIUS === POCKET_RADIUS / PHYSICS_MULTIPLIER', () => {
    expect(RENDER_POCKET_RADIUS).toBe(POCKET_RADIUS / PHYSICS_MULTIPLIER);
  });

  it('RENDER_POCKET_POSITIONS.length === 6 (all pockets covered)', () => {
    expect(RENDER_POCKET_POSITIONS.length).toBe(POCKET_POSITIONS.length);
    expect(RENDER_POCKET_POSITIONS.length).toBe(6);
  });

  it('all 6 render pocket positions are distinct', () => {
    const keys = RENDER_POCKET_POSITIONS.map(p => `${p.x},${p.z}`);
    expect(new Set(keys).size).toBe(6);
  });

});
