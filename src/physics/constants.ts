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

/** Space cube half-dimensions: (30000, 20000, 20000) */
export const SPACE_SCALE_X = 30000;
export const SPACE_SCALE_Y = 20000;
export const SPACE_SCALE_Z = 20000;

// ─── Rail geometry ────────────────────────────────────────────────────────────

export const RAIL_LONG_X  = 12699;  // x of long rails (±)
export const RAIL_BACK_X  = 6290;   // x offset of short back rail
export const RAIL_BACK_Z  = 6349;   // z of short rails (±)
export const RAIL_LONG_SCALE_X  = 11150;
export const RAIL_LONG_RADIUS   = 5575;
export const RAIL_SHORT_SCALE_X = 11269;
export const RAIL_SHORT_RADIUS  = 5634;

/** Corner pocket jaw cushions (angled ±45°) */
export const CORNER_A_X = 12128;  export const CORNER_A_Z = 6552;
export const CORNER_B_X = 12901;  export const CORNER_B_Z = 5778;
export const CORNER_A_SCALE_X = 570;  export const CORNER_A_RADIUS = 285;
export const CORNER_B_SCALE_X = 569;  export const CORNER_B_RADIUS = 284;

/** Diagonal unit vector component for 45° corner guards (trunc(10000 × sin 45°)) */
export const DIAG_UNIT = 7071;

/** Table cloth plane dimensions */
export const PLANE_SCALE_X = 25399;
export const PLANE_RADIUS  = 12699;

// ─── Pocket geometry ─────────────────────────────────────────────────────────

/** Pocket trigger radius (larger than ball for acceptance zone) */
export const POCKET_RADIUS = 450;

/** 6 pocket positions: [x, z] pairs */
export const POCKET_POSITIONS: [number, number][] = [
  [ 12875,  6510],
  [ 12875, -6510],
  [-12875,  6510],
  [-12875, -6510],
  [     0,  7100],
  [     0, -7100],
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
 * Maximum cue shot force (impulse magnitude) in fixed-point.
 *
 * DETERMINISM INVARIANT (G1): With force ≤ MAX_FORCE and mass ≥ 1, all physics
 * intermediate products remain within safe bounds for JS Number and C# long.
 * Raising this above ~325000 (5×) would enter the 2^59+ regime where ULP > 10^6
 * and precision loss occurs. Any change MUST re-run G1 fuzz and update this comment.
 */
export const MAX_FORCE = 65000;
