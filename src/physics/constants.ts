/**
 * Single source of truth for physics constants — authoritative values from Game.unity.
 *
 * All tests and runtime setup MUST import from here. Never hardcode these values.
 * To update: change here, then regenerate tests/fixtures/physics-golden-vectors.json.
 *
 * Scale: 1 unit = 0.0001 m (MULTIPLIER = 10000).
 * Sources: tools/golden-vector-runner/Program.cs + Game.unity scene.
 */

import type { CmMaterial } from './colliders';

/** Fixed-point multiplier (10000 = 1.0) */
export const PHYSICS_MULTIPLIER = 10000;

// ─── Ball geometry ────────────────────────────────────────────────────────────

/** Ball mass in fixed-point (0.17 kg × 10000 = 1700) */
export const BALL_MASS = 1700;

/** Ball radius in fixed-point (0.0285 m × 10000 = 285 units) */
export const BALL_RADIUS = 285;

// ─── Table geometry ──────────────────────────────────────────────────────────

/** Y position of table cloth surface */
export const TABLE_Y = 9154;

/** Y position of ball center at rest on cloth (TABLE_Y + BALL_RADIUS, rounded) */
export const BALL_Y = 9440;

/**
 * Space cube half-dimensions and position.
 * Source: UnityCmSpace.cs:114 reads Game.unity serialized field; active object at Game.unity:25395.
 * unityTrue: scale=(40000,30000,30000), pos=(0,5000,0).
 * Previous port had (30000,20000,20000)/pos0 — zero Unity source (fabricated), now corrected.
 */
export const SPACE_SCALE_X = 40000;
export const SPACE_SCALE_Y = 30000;
export const SPACE_SCALE_Z = 30000;
/** Y offset of space cube centre (Unity true: 5000 = 0.5 m above table origin) */
export const SPACE_POS_Y   = 5000;

// ─── Rail geometry ────────────────────────────────────────────────────────────

// Authoritative source: _Game/Scenes/Game.unity (47170 lines)
// LineCollider positions verified at lines 21789/24877/32798/35440 by 卡卡西.
export const RAIL_LONG_X  = 12699;  // x of long side rails (±)
export const RAIL_BACK_X  = 6244;   // x offset of end cushion (split segments)
export const RAIL_BACK_Z  = 6349;   // z of end rails (±), side pocket gap at x≈0
export const RAIL_LONG_SCALE_X  = 11045;  // Game.unity scale.x=1.1045
export const RAIL_LONG_RADIUS   = 5522;   // scale/2
export const RAIL_SHORT_SCALE_X = 11260;  // Game.unity scale.x=1.126
export const RAIL_SHORT_RADIUS  = 5630;   // scale/2

/** Corner pocket jaw cushions (angled ±45°) — all 4 corners, 2 jaws each = 8 total */
// LineColliderPocket 0-7 in Game.unity; A=arm along z-axis, B=arm along x-axis.
export const CORNER_A_X = 12075;  export const CORNER_A_Z = 6551;
export const CORNER_B_X = 12901;  export const CORNER_B_Z = 5723;
export const CORNER_A_SCALE_X = 570;  export const CORNER_A_RADIUS = 285;
export const CORNER_B_SCALE_X = 569;  export const CORNER_B_RADIUS = 284;

/** Diagonal unit vector component for 45° corner guards (trunc(10000 × sin 45°)) */
export const DIAG_UNIT = 7071;

/** Side pocket jaw cushions (angled ~10° into pocket) — LineColliderPocket 8-11 */
// 2 jaws per side pocket × 2 side pockets = 4 total.
// Angle: sin(10°)×10000=1736, cos(10°)×10000=9848.
export const SIDE_JAW_X      = 579;   // |x| of jaw cushion center
export const SIDE_JAW_Z      = 6546;  // |z| of jaw cushion center
export const SIDE_JAW_SCALE  = 400;   // scale.x (= 2×radius)
export const SIDE_JAW_RADIUS = 200;   // radius
export const SIDE_JAW_SIN    = 1736;  // sin(10°) × 10000
export const SIDE_JAW_COS    = 9848;  // cos(10°) × 10000

/** Table cloth plane dimensions */
export const PLANE_SCALE_X = 25399;
export const PLANE_RADIUS  = 12699;

// ─── Pocket geometry ─────────────────────────────────────────────────────────

/** Pocket trigger radius (larger than ball for acceptance zone) */
export const POCKET_RADIUS = 450;

/**
 * 6 pocket trigger positions: [x, z] pairs.
 * Source: KinematicTrigger transforms in _Game/Scenes/Game.unity.
 * unityTrue: corner=(±12949,±6549), side=(0,±7129), radius=450.
 * Previous port had (±12875,±6510)/(0,±7100) — zero Unity source (fabricated), now corrected.
 */
export const POCKET_POSITIONS: [number, number][] = [
  [ 12949,  6549],
  [ 12949, -6549],
  [-12949,  6549],
  [-12949, -6549],
  [     0,  7129],
  [     0, -7129],
];

// ─── Materials (from Game.unity scene, fixed-point: bounciness, rolling, twisting, dynamic, static) ───

/** Ball-to-ball contact material */
export const BALL_MATERIAL: CmMaterial = {
  bounciness:       9499,
  rollingFriction:    49,
  twistingFriction: 200000,
  dynamicFriction:   500,
  staticFriction:    599,
};

/**
 * Table cloth (plane collider).
 * Source: Game.unity PlaneCollider serialized field (line 14171–14176), which is the
 * result of CmMath.FromFloat(PlaneCmMateria.asset) baked by the Unity Editor.
 * Runtime reads the serialized struct directly — FromFloat runs only in #if UNITY_EDITOR.
 */
export const CLOTH_MATERIAL: CmMaterial = {
  bounciness:       1000,
  rollingFriction:    99,
  twistingFriction: 200000,
  dynamicFriction:  2000,
  staticFriction:   3000,
};

/** Cushion rail */
export const RAIL_MATERIAL: CmMaterial = {
  bounciness:       6000,
  rollingFriction:     0,
  twistingFriction:    0,
  dynamicFriction:     0,
  staticFriction:   2000,
};

// ─── Simulation engine constants (G9 single-source) ─────────────────────────

/** Adaptive timestep bounds for physics steps (Fixed integer, same units as positions) */
export const MIN_TS = 50;
export const MAX_TS = 200;

/** Divisor in adaptive timestep formula: ts = clamp(radius / (vel * PRECISION), MIN_TS, MAX_TS) */
export const PRECISION = 2;

/** Deactivation threshold: body considered stopped when sqrVelocity < MIN_SQR_VELOCITY */
export const MIN_SQR_VELOCITY = 100;

/** Consecutive low-velocity checks required before a body is marked inactive */
export const C_COUNT = 2;

/** Safety cap on physics steps per shot (C# engine is uncapped; cap only in runner/TS) */
export const MAX_SIM_STEPS = 2_000_000;

// ─── Shot parameters ─────────────────────────────────────────────────────────

/**
 * Maximum cue shot impulse in fixed-point — faithful port of CueManager.cs Impulse property.
 *
 * Derivation (authoritative Game.unity sources):
 *   impulse = CueManager.maxForce × cueItemData.maxForce × horizontalFactor(0) × power
 *   = 1.3 × 1.0 × 1.0 × 10000  (at full power, horizontal shot, premium cue)
 *   = 13000
 * Sources:
 *   CueManager.maxForce = 1.3  (Game.unity MonoBehaviour serialized field)
 *   cueItemData.maxForce = 1.0  (BallPoolConfig.asset, premium cue; range 0.7~1.0)
 *   horizontalFactor.Evaluate(0) = 1.0  (AnimationCurve at vr01=0, no elevation)
 *
 * PREVIOUS BUG: 65000 was CmRigidbody.MaxVelocity — a Unity audio-normalisation constant,
 * never used as a force cap. At 65000, ball velocity reached 382,353 (> rail-tunnel threshold
 * 114,000), causing balls to skip through cushions and penetrate the table (B1 bug).
 *
 * DETERMINISM INVARIANT (G1): With force ≤ MAX_FORCE and mass ≥ 1, all physics
 * intermediate products remain within safe bounds for JS Number and C# long.
 */
export const MAX_FORCE = 13000;
