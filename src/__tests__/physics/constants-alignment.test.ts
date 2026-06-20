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
  POCKET_RADIUS, POCKET_POSITIONS, MAX_FORCE,
  SPACE_SCALE_X, SPACE_SCALE_Y, SPACE_SCALE_Z,
  RAIL_LONG_X, RAIL_LONG_SCALE_X, RAIL_LONG_RADIUS,
  RAIL_BACK_X, RAIL_BACK_Z, RAIL_SHORT_SCALE_X, RAIL_SHORT_RADIUS,
  CORNER_A_X, CORNER_A_Z, CORNER_A_SCALE_X, CORNER_A_RADIUS,
  CORNER_B_X, CORNER_B_Z, CORNER_B_SCALE_X, CORNER_B_RADIUS,
  DIAG_UNIT, PLANE_SCALE_X, PLANE_RADIUS,
  PHYSICS_MULTIPLIER, MIN_TS, MAX_TS, PRECISION, MIN_SQR_VELOCITY, C_COUNT,
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

  it('authoritative RAIL_MATERIAL matches Game.unity cushion (5/5)', () => {
    // RailCmMateria.asset: bounciness=0.6, rolling=0, twisting=0, dynamic=0, static=0.2
    // CmMath.FromFloat: (long)(v * 10000f), e.g. 0.6f × 10000f = 6000.
    expect(RAIL_MATERIAL.bounciness).toBe(6000);
    expect(RAIL_MATERIAL.rollingFriction).toBe(0);
    expect(RAIL_MATERIAL.twistingFriction).toBe(0);
    expect(RAIL_MATERIAL.dynamicFriction).toBe(0);
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

  it('table-setup ball material == authoritative BALL_MATERIAL (5/5)', () => {
    const space = createPoolTable();
    for (const body of space.rigidbodies) {
      expect(body.collider.material.bounciness).toBe(BALL_MATERIAL.bounciness);
      expect(body.collider.material.rollingFriction).toBe(BALL_MATERIAL.rollingFriction);
      expect(body.collider.material.twistingFriction).toBe(BALL_MATERIAL.twistingFriction);
      expect(body.collider.material.dynamicFriction).toBe(BALL_MATERIAL.dynamicFriction);
      expect(body.collider.material.staticFriction).toBe(BALL_MATERIAL.staticFriction);
    }
  });

  it('table-setup space scale matches authoritative (30000 × 20000 × 20000)', () => {
    expect(SPACE_SCALE_X).toBe(30000);
    expect(SPACE_SCALE_Y).toBe(20000);
    expect(SPACE_SCALE_Z).toBe(20000);
  });
});

// ─── Rail geometry ────────────────────────────────────────────────────────────

describe('G9: rail geometry constants — pinned vs Game.unity cmLineCollider blocks', () => {
  // Long rail (runs along z axis, positioned at ±RAIL_LONG_X)
  // Source: Game.unity LineCollider "RailRightLong" position.x = 1.2699, scale.x = 1.115
  it('RAIL_LONG_X == 12699', () => { expect(RAIL_LONG_X).toBe(12699); });
  it('RAIL_LONG_SCALE_X == 11150, RAIL_LONG_RADIUS == 5575 (scale/2)', () => {
    expect(RAIL_LONG_SCALE_X).toBe(11150);
    expect(RAIL_LONG_RADIUS).toBe(5575);
  });

  // Short back rails (runs along x axis, positioned at ±RAIL_BACK_Z)
  // Source: "RailBackRight" position = (0.629, -, 0.6349), scale.x = 1.1269
  it('RAIL_BACK_X == 6290, RAIL_BACK_Z == 6349', () => {
    expect(RAIL_BACK_X).toBe(6290);
    expect(RAIL_BACK_Z).toBe(6349);
  });
  it('RAIL_SHORT_SCALE_X == 11269, RAIL_SHORT_RADIUS == 5634 (scale/2)', () => {
    expect(RAIL_SHORT_SCALE_X).toBe(11269);
    expect(RAIL_SHORT_RADIUS).toBe(5634);
  });

  // Corner jaw A (near corner pocket, longer arm): position=(1.2128, -, 0.6552), scale.x=0.057
  it('CORNER_A_X == 12128, CORNER_A_Z == 6552', () => {
    expect(CORNER_A_X).toBe(12128);
    expect(CORNER_A_Z).toBe(6552);
  });
  it('CORNER_A_SCALE_X == 570, CORNER_A_RADIUS == 285 (scale/2 = BALL_RADIUS)', () => {
    expect(CORNER_A_SCALE_X).toBe(570);
    expect(CORNER_A_RADIUS).toBe(285);
  });

  // Corner jaw B (near corner pocket, shorter arm): position=(1.2901, -, 0.5778), scale.x=0.0569
  it('CORNER_B_X == 12901, CORNER_B_Z == 5778', () => {
    expect(CORNER_B_X).toBe(12901);
    expect(CORNER_B_Z).toBe(5778);
  });
  it('CORNER_B_SCALE_X == 569, CORNER_B_RADIUS == 284 (scale/2)', () => {
    expect(CORNER_B_SCALE_X).toBe(569);
    expect(CORNER_B_RADIUS).toBe(284);
  });

  // 45° diagonal unit (trunc(10000 × sin 45°) = trunc(7071.06...) = 7071)
  it('DIAG_UNIT == 7071', () => { expect(DIAG_UNIT).toBe(7071); });

  // Table cloth plane dimensions (2 × RAIL_LONG_X = 25398; Game.unity uses 25399)
  it('PLANE_SCALE_X == 25399, PLANE_RADIUS == 12699', () => {
    expect(PLANE_SCALE_X).toBe(25399);
    expect(PLANE_RADIUS).toBe(12699);
  });
});

// ─── Pocket geometry ──────────────────────────────────────────────────────────

describe('G9: pocket geometry — POCKET_RADIUS and all 6 POCKET_POSITIONS', () => {
  it('POCKET_RADIUS == 450', () => {
    expect(POCKET_RADIUS).toBe(450);
  });

  it('POCKET_POSITIONS has 6 entries', () => {
    expect(POCKET_POSITIONS).toHaveLength(6);
  });

  // Corner pockets (4): at ±RAIL_LONG_X ± z-offset
  it('POCKET_POSITIONS[0] == [12875,  6510] (corner +x +z)', () => {
    expect(POCKET_POSITIONS[0]).toEqual([12875,  6510]);
  });
  it('POCKET_POSITIONS[1] == [12875, -6510] (corner +x -z)', () => {
    expect(POCKET_POSITIONS[1]).toEqual([12875, -6510]);
  });
  it('POCKET_POSITIONS[2] == [-12875,  6510] (corner -x +z)', () => {
    expect(POCKET_POSITIONS[2]).toEqual([-12875,  6510]);
  });
  it('POCKET_POSITIONS[3] == [-12875, -6510] (corner -x -z)', () => {
    expect(POCKET_POSITIONS[3]).toEqual([-12875, -6510]);
  });
  // Side pockets (2): at x=0, ±z
  it('POCKET_POSITIONS[4] == [0, 7100] (side +z)', () => {
    expect(POCKET_POSITIONS[4]).toEqual([0, 7100]);
  });
  it('POCKET_POSITIONS[5] == [0, -7100] (side -z)', () => {
    expect(POCKET_POSITIONS[5]).toEqual([0, -7100]);
  });
});

// ─── Engine constants ─────────────────────────────────────────────────────────

describe('G9: simulation engine constants — pinned vs C# CmSpace/CmRigidbody/CmSimpleMath', () => {
  // CmSimpleMath.cs: defoultMultiplier = 10000
  it('PHYSICS_MULTIPLIER == 10000', () => {
    expect(PHYSICS_MULTIPLIER).toBe(10000);
  });

  // CmSpace.cs: minTimestep = 50, maxTimestep = 200, precision = 2
  it('MIN_TS == 50 (CmSpace.minTimestep)', () => {
    expect(MIN_TS).toBe(50);
  });
  it('MAX_TS == 200 (CmSpace.maxTimestep)', () => {
    expect(MAX_TS).toBe(200);
  });
  it('PRECISION == 2 (CmSpace.precision — adaptive timestep divisor)', () => {
    expect(PRECISION).toBe(2);
  });

  // CmRigidbody.cs: minSqrVelocity = 100, CheckIsActive uses 2 consecutive checks
  it('MIN_SQR_VELOCITY == 100 (CmRigidbody.minSqrVelocity)', () => {
    expect(MIN_SQR_VELOCITY).toBe(100);
  });
  it('C_COUNT == 2 (consecutive low-velocity checks before deactivation)', () => {
    expect(C_COUNT).toBe(2);
  });
});

// ─── table-setup collider materials ──────────────────────────────────────────

describe('G9: table-setup collider materials — plane CLOTH + rails RAIL (5/5 each)', () => {
  it('plane collider (index 0) carries CLOTH_MATERIAL 5/5', () => {
    const space = createPoolTable();
    const plane = space.colliders[0];
    expect(plane.material.bounciness).toBe(CLOTH_MATERIAL.bounciness);
    expect(plane.material.rollingFriction).toBe(CLOTH_MATERIAL.rollingFriction);
    expect(plane.material.twistingFriction).toBe(CLOTH_MATERIAL.twistingFriction);
    expect(plane.material.dynamicFriction).toBe(CLOTH_MATERIAL.dynamicFriction);
    expect(plane.material.staticFriction).toBe(CLOTH_MATERIAL.staticFriction);
  });

  it('all 8 rail/corner colliders (indices 1-8) carry RAIL_MATERIAL 5/5', () => {
    const space = createPoolTable();
    const rails = space.colliders.slice(1); // 2 long + 2 short + 4 corner = 8
    expect(rails).toHaveLength(8);
    for (const rail of rails) {
      expect(rail.material.bounciness).toBe(RAIL_MATERIAL.bounciness);
      expect(rail.material.rollingFriction).toBe(RAIL_MATERIAL.rollingFriction);
      expect(rail.material.twistingFriction).toBe(RAIL_MATERIAL.twistingFriction);
      expect(rail.material.dynamicFriction).toBe(RAIL_MATERIAL.dynamicFriction);
      expect(rail.material.staticFriction).toBe(RAIL_MATERIAL.staticFriction);
    }
  });
});
