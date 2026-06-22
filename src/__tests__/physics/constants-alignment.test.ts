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
import { CmVector } from '../../physics/cm-vector';
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
  SIDE_JAW_X, SIDE_JAW_Z, SIDE_JAW_SCALE, SIDE_JAW_RADIUS, SIDE_JAW_SIN, SIDE_JAW_COS,
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

  it('authoritative MAX_FORCE == 13000 (B1: CueManager.maxForce×cueItemData.maxForce×10000 = 1.3×1.0×10000)', () => {
    // B1 fix: 65000 was CmRigidbody.MaxVelocity (audio constant), never a force cap.
    // Correct value = CueManager.maxForce(1.3) × cueItemData.maxForce(1.0, premium) × MULTIPLIER(10000) = 13000.
    expect(MAX_FORCE).toBe(13000);
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

  it('table-setup space scale matches authoritative unityTrue (40000 × 30000 × 30000)', () => {
    // unityTrue: Game.unity:25395, UnityCmSpace.cs:114; previous (30000,20000,20000)/pos0 was fabricated.
    expect(SPACE_SCALE_X).toBe(40000);
    expect(SPACE_SCALE_Y).toBe(30000);
    expect(SPACE_SCALE_Z).toBe(30000);
  });
});

// ─── Rail geometry ────────────────────────────────────────────────────────────

describe('G9: rail geometry constants — pinned vs _Game/Scenes/Game.unity cmLineCollider blocks', () => {
  // Authoritative source: _Game/Scenes/Game.unity (47170 lines).
  // Values verified by 卡卡西 at lines 21789/24877/32798/35440.

  // Long side rails (LineCollider 4+5): position.x=±1.2699, scale.x=1.1045
  it('RAIL_LONG_X == 12699', () => { expect(RAIL_LONG_X).toBe(12699); });
  it('RAIL_LONG_SCALE_X == 11045, RAIL_LONG_RADIUS == 5522 (scale/2)', () => {
    expect(RAIL_LONG_SCALE_X).toBe(11045);
    expect(RAIL_LONG_RADIUS).toBe(5522);
  });

  // End cushion half-segments (LineColliders 0-3): split at x≈0 by side pocket gap
  // position.x=±0.6244 (each half), position.z=±0.6349, scale.x=1.126
  it('RAIL_BACK_X == 6244, RAIL_BACK_Z == 6349', () => {
    expect(RAIL_BACK_X).toBe(6244);
    expect(RAIL_BACK_Z).toBe(6349);
  });
  it('RAIL_SHORT_SCALE_X == 11260, RAIL_SHORT_RADIUS == 5630 (scale/2)', () => {
    expect(RAIL_SHORT_SCALE_X).toBe(11260);
    expect(RAIL_SHORT_RADIUS).toBe(5630);
  });

  // Corner jaw A (LineColliderPocket 0/2/4/6): position.x=±1.2075, |z|=0.6551, scale.x=0.057
  it('CORNER_A_X == 12075, CORNER_A_Z == 6551', () => {
    expect(CORNER_A_X).toBe(12075);
    expect(CORNER_A_Z).toBe(6551);
  });
  it('CORNER_A_SCALE_X == 570, CORNER_A_RADIUS == 285 (scale/2 = BALL_RADIUS)', () => {
    expect(CORNER_A_SCALE_X).toBe(570);
    expect(CORNER_A_RADIUS).toBe(285);
  });

  // Corner jaw B (LineColliderPocket 1/3/5/7): position.x=±1.2901, |z|=0.5723, scale.x=0.0569
  it('CORNER_B_X == 12901, CORNER_B_Z == 5723', () => {
    expect(CORNER_B_X).toBe(12901);
    expect(CORNER_B_Z).toBe(5723);
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

  // Side pocket jaw cushions (LineColliderPocket 8-11): angled ~10° into pocket
  it('SIDE_JAW_X == 579, SIDE_JAW_Z == 6546', () => {
    expect(SIDE_JAW_X).toBe(579);
    expect(SIDE_JAW_Z).toBe(6546);
  });
  it('SIDE_JAW_SCALE == 400, SIDE_JAW_RADIUS == 200', () => {
    expect(SIDE_JAW_SCALE).toBe(400);
    expect(SIDE_JAW_RADIUS).toBe(200);
  });
  it('SIDE_JAW_SIN == 1736, SIDE_JAW_COS == 9848 (sin/cos 10° × 10000)', () => {
    expect(SIDE_JAW_SIN).toBe(1736);
    expect(SIDE_JAW_COS).toBe(9848);
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

  // Corner pockets (4): unityTrue from KinematicTrigger in _Game/Scenes/Game.unity
  // Previous (±12875,±6510) was fabricated (zero Unity source); corrected to unityTrue.
  it('POCKET_POSITIONS[0] == [12949,  6549] (corner +x +z — unityTrue)', () => {
    expect(POCKET_POSITIONS[0]).toEqual([12949,  6549]);
  });
  it('POCKET_POSITIONS[1] == [12949, -6549] (corner +x -z — unityTrue)', () => {
    expect(POCKET_POSITIONS[1]).toEqual([12949, -6549]);
  });
  it('POCKET_POSITIONS[2] == [-12949,  6549] (corner -x +z — unityTrue)', () => {
    expect(POCKET_POSITIONS[2]).toEqual([-12949,  6549]);
  });
  it('POCKET_POSITIONS[3] == [-12949, -6549] (corner -x -z — unityTrue)', () => {
    expect(POCKET_POSITIONS[3]).toEqual([-12949, -6549]);
  });
  // Side pockets (2): unityTrue from KinematicTrigger; previous (0,±7100) was fabricated.
  it('POCKET_POSITIONS[4] == [0, 7129] (side +z — unityTrue)', () => {
    expect(POCKET_POSITIONS[4]).toEqual([0, 7129]);
  });
  it('POCKET_POSITIONS[5] == [0, -7129] (side -z — unityTrue)', () => {
    expect(POCKET_POSITIONS[5]).toEqual([0, -7129]);
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

  it('all 18 rail/jaw/side colliders (indices 1-18) carry RAIL_MATERIAL 5/5', () => {
    // 2 long + 4 end + 8 corner jaw + 4 side jaw = 18 rail colliders
    const space = createPoolTable();
    const rails = space.colliders.slice(1); // index 0 is cloth plane
    expect(rails).toHaveLength(18);
    for (const rail of rails) {
      expect(rail.material.bounciness).toBe(RAIL_MATERIAL.bounciness);
      expect(rail.material.rollingFriction).toBe(RAIL_MATERIAL.rollingFriction);
      expect(rail.material.twistingFriction).toBe(RAIL_MATERIAL.twistingFriction);
      expect(rail.material.dynamicFriction).toBe(RAIL_MATERIAL.dynamicFriction);
      expect(rail.material.staticFriction).toBe(RAIL_MATERIAL.staticFriction);
    }
  });
});

// ─── Gravity ──────────────────────────────────────────────────────────────────

describe('G9: CmVector.gravity — pinned vs C# (0, -98100, 0)', () => {
  // CmRigidbody.cs: gravity = new CmVector(0, -9.81f * defoultMultiplier, 0) = (0, -98100, 0)
  // Used every physics step in friction/rest calculations — drift breaks determinism.
  it('CmVector.gravity.x === 0', () => { expect(CmVector.gravity.x).toBe(0); });
  it('CmVector.gravity.y === -98100 (−9.81 m/s² × 10000)', () => { expect(CmVector.gravity.y).toBe(-98100); });
  it('CmVector.gravity.z === 0', () => { expect(CmVector.gravity.z).toBe(0); });
});
