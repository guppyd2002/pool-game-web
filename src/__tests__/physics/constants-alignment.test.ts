/**
 * G9 single-source-of-truth alignment test.
 *
 * Verifies that the shipped game (table-setup.ts) and test harnesses (golden-vector.test.ts)
 * both use the authoritative constants from physics/constants.ts, which are sourced from
 * Game.unity. Any divergence is a false-confidence failure: "11/11 GV pass" would mean
 * "tests pass on wrong config, real game diverges from C# golden vectors."
 *
 * RED before G9: table-setup used BALL_MASS=10000 (MULTIPLIER). GREEN after: 1700.
 */
import { describe, it, expect } from 'vitest';
import {
  BALL_MASS, BALL_RADIUS, TABLE_Y, BALL_Y,
  BALL_MATERIAL, CLOTH_MATERIAL, RAIL_MATERIAL,
  POCKET_RADIUS, MAX_FORCE,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
} from '../../physics/constants';
import { createPoolTable } from '../../game/table-setup';

describe('G9: physics constants — single source of truth', () => {
  it('authoritative BALL_MASS == 1700 (Game.unity 0.17 kg × 10000)', () => {
    expect(BALL_MASS).toBe(1700);
  });

  it('authoritative BALL_RADIUS == 285', () => {
    expect(BALL_RADIUS).toBe(285);
  });

  it('authoritative BALL_Y == TABLE_Y + BALL_RADIUS ≈ 9440', () => {
    expect(BALL_Y).toBe(9440);
    expect(TABLE_Y).toBe(9154);
  });

  it('authoritative BALL_MATERIAL matches Game.unity ball-ball contact', () => {
    expect(BALL_MATERIAL.bounciness).toBe(9499);
    expect(BALL_MATERIAL.rollingFriction).toBe(49);
    expect(BALL_MATERIAL.twistingFriction).toBe(200000);
    expect(BALL_MATERIAL.dynamicFriction).toBe(500);
    expect(BALL_MATERIAL.staticFriction).toBe(599);
  });

  it('authoritative CLOTH_MATERIAL matches Game.unity runtime (serialized PlaneCollider)', () => {
    // Values = CmMath.FromFloat(PlaneCmMateria.asset) baked by Unity Editor into scene.
    // Runtime reads the serialized struct directly (UnityCmPlaneCollider.GetCmCollider()).
    // The GV runner previously had stale values (500/8000/8999); corrected in G9-B.
    expect(CLOTH_MATERIAL.bounciness).toBe(1000);
    expect(CLOTH_MATERIAL.rollingFriction).toBe(99);
    expect(CLOTH_MATERIAL.twistingFriction).toBe(200000);
    expect(CLOTH_MATERIAL.dynamicFriction).toBe(2000);
    expect(CLOTH_MATERIAL.staticFriction).toBe(3000);
  });

  it('authoritative RAIL_MATERIAL matches Game.unity cushion', () => {
    expect(RAIL_MATERIAL.bounciness).toBe(6000);
    expect(RAIL_MATERIAL.staticFriction).toBe(2000);
  });

  it('authoritative MAX_FORCE == 65000 (G1 ingress bound)', () => {
    expect(MAX_FORCE).toBe(65000);
  });

  it('table-setup ball mass == authoritative BALL_MASS (shipped config matches golden)', () => {
    const space = createPoolTable();
    for (const body of space.rigidbodies) {
      expect(body.mass).toBe(BALL_MASS);
    }
  });

  it('table-setup ball radius == authoritative BALL_RADIUS', () => {
    const space = createPoolTable();
    for (const body of space.rigidbodies) {
      expect(body.collider.radius).toBe(BALL_RADIUS);
    }
  });

  it('table-setup ball material == authoritative BALL_MATERIAL', () => {
    const space = createPoolTable();
    for (const body of space.rigidbodies) {
      expect(body.collider.material.bounciness).toBe(BALL_MATERIAL.bounciness);
      expect(body.collider.material.staticFriction).toBe(BALL_MATERIAL.staticFriction);
    }
  });

  it('table-setup space scale matches authoritative (30000 × 20000 × 20000)', () => {
    expect(SPACE_SCALE_X).toBe(30000);
    expect(SPACE_SCALE_Y).toBe(20000);
    expect(SPACE_SCALE_Z).toBe(20000);
  });
});
