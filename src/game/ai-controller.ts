/**
 * P1-T05 — BallPool8 AI Controller (port of BallPoolAIManager.CalculateBestShot).
 *
 * Faithful port of Unity C# ghost-ball geometry + SphereCast validation + heuristic ranking.
 * Reference: Assets/_Game/BallPool/Scripts/AI/BallPoolAIManager.cs :96-286.
 *
 * Key design decisions (locked with 千手/鼬/卡卡西 2026-06-22):
 *   C-1  Headless driver uses TRUE isFirstShot from GameManager path (break=true, normal=false).
 *        Does NOT replicate ForceShot/CalculateAI(bool) which hardcodes isFirstShot=false.
 *   C-2  PRNG consumption order matches C# exactly:
 *        1 draw (moveCueBall, unconditional) → foreach pockets × allowable balls:
 *          if(moveCueBall&&isFirstShot&&ballInHand): 2 draws (placement A1/A2)
 *          1-2 draws (deltaError B1/B2) → after loop: 1 draw (force F).
 *   C-3  deltaVector x/z use same scalar (diagonal, :154).
 *   C-4  Each AI instance carries its own rank (not global OpponentPlayer slot).
 *   C-5  SphereCast Boards = physics cushion inventory from createPoolTable (same source, no parallel set).
 *   C-6  Cast1 (ball→pocket): excludes target ball, cueBall participates naturally.
 *        Cast2 (cue→ghost): no exclusion, no extra cueBall param.
 *   C-7  Ghost-ball geometry uses float arithmetic (matches C# Unity float space).
 *   C-8  :126 `moveCueBall ? 0.25f : 1f` dead branch (always 0.25 inside if(moveCueBall&&...)) — registered as DIV.
 *   C-9  No safety guarantee added (matches Unity: null targetBall → fires residual cueForward at full force).
 */

import { CmVector } from '../physics/cm-vector';
import { CmSpace } from '../physics/cm-space';
import { MULTIPLIER } from '../physics/fixed-math';
import {
  BALL_RADIUS, MAX_FORCE,
} from '../physics/constants';
import { analyticSphereCast } from './ball-pool-physics';
import type { ShotData } from './ball-pool-physics';

// ─── AI constants (from Unity scene / BallPoolAIManager inspector) ────────────

/** Max target distance for force scaling (Unity meters, BallPoolAIManager:26 maxDistance=3f). */
const AI_MAX_DISTANCE = 3.0;

/** Max AI impulse = MAX_FORCE (Fixed). cueManager.MaxForce=1.3 Unity → 13000 Fixed. */
const AI_MAX_FORCE_FIXED = MAX_FORCE;

/** Ball radius in Unity float meters. */
const BALL_R = BALL_RADIUS / MULTIPLIER;

/** Diameter in Unity float meters. */
const BALL_DIAM = BALL_R * 2;

/**
 * AI pocket positions in Unity meters [x, z] — from Game.unity scene
 * (BallPoolAIManager.aiPocketsTranform[], inspector order 0-5, Y dropped by ProjectOnPlane).
 * These are the "aim target" positions, distinct from physics KinematicTrigger centers.
 *
 * Order: corner(+x,-z), corner(+x,+z), corner(-x,-z), corner(-x,+z), side(-z), side(+z).
 * Registered as self-play controlled deviation: ordering is scene-authoritative, not
 * measure-zero tie-break relevant (Unity unseeded → can't match shot values anyway).
 */
const AI_POCKETS_XZ: readonly [number, number][] = [
  [ 1.237, -0.602],  // idx0: corner (+x, -z)
  [ 1.237,  0.602],  // idx1: corner (+x, +z)
  [-1.237, -0.602],  // idx2: corner (-x, -z)
  [-1.237,  0.602],  // idx3: corner (-x, +z)
  [ 0,     -0.645],  // idx4: side (-z)
  [ 0,      0.645],  // idx5: side (+z)
];

/**
 * FirstQuad Transform from Game.unity (break zone for cue ball placement).
 * localScale {x:0.655, z:1.27}, localPosition {x:-0.942, z:0}.
 * Bounds: X ∈ [-1.2695, -0.6145], Z ∈ [-0.635, 0.635].
 */
const FIRST_QUAD = { cx: -0.942, cz: 0, sx: 0.655, sz: 1.27 } as const;

/** Minimum alignment dot product — shots with cDot < 0.05 are skipped (:159). */
const MIN_DOT = 0.05;

/** Rank noise radius (Unity meters, :154 deltaVector = radius * deltaError * [1,0,1]). */
const NOISE_R = BALL_R;

// ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────
// Consumption order must match C# Random.Range call sequence exactly (C-2).

function makePrng(seed: number): (min: number, max: number) => number {
  let s = seed | 0;
  return function range(min: number, max: number): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const f = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + f * (max - min);
  };
}

// ─── BallsOnTable helper ──────────────────────────────────────────────────────

interface ActiveBall {
  id: number;
  x: number;  // Unity float meters
  z: number;
}

/**
 * Get non-kinematic, non-OOT, non-cue balls in ascending ID order.
 * Mirrors CueCalculateManager.UpdateBalls() which iterates balls[] array (id-indexed).
 */
function getBallsOnTable(space: CmSpace): ActiveBall[] {
  const result: ActiveBall[] = [];
  for (const body of space.rigidbodies) {
    if (body.id === 0) continue;                    // skip cue ball (cueBall !== ball)
    if (body.isKinematic || body.isOutOfCube) continue;  // skip pocketed/OOT
    result.push({
      id: body.id,
      x: body.collider.position.x / MULTIPLIER,
      z: body.collider.position.z / MULTIPLIER,
    });
  }
  // space.rigidbodies is id-ordered (array indexed by id), so result is already ascending.
  return result;
}

/** Get cue ball position in Unity float meters. */
function getCueBallFloat(space: CmSpace): ActiveBall {
  const body = space.rigidbodies[0];
  return { id: 0, x: body.collider.position.x / MULTIPLIER, z: body.collider.position.z / MULTIPLIER };
}

// ─── PositionIsFree ───────────────────────────────────────────────────────────

/**
 * Check if a candidate cue ball position is within firstQuad bounds and
 * doesn't overlap any active ball (XZ plane only).
 * Mirrors CueBallMoveManager.PositionIsFree() with firstQuad mode.
 */
function positionIsFree(
  px: number, pz: number,
  ballsOnTable: ActiveBall[], cueBall: ActiveBall,
): boolean {
  // Sphere-in-cube: center must be ≥ BALL_R inside each face
  const xMin = FIRST_QUAD.cx - FIRST_QUAD.sx * 0.5 + BALL_R;
  const xMax = FIRST_QUAD.cx + FIRST_QUAD.sx * 0.5 - BALL_R;
  const zMin = FIRST_QUAD.cz - FIRST_QUAD.sz * 0.5 + BALL_R;
  const zMax = FIRST_QUAD.cz + FIRST_QUAD.sz * 0.5 - BALL_R;
  if (px < xMin || px > xMax || pz < zMin || pz > zMax) return false;

  // No overlap with other active balls
  const diam2 = BALL_DIAM * BALL_DIAM;
  for (const b of ballsOnTable) {
    const dx = px - b.x, dz = pz - b.z;
    if (dx * dx + dz * dz < diam2) return false;
  }
  // No overlap with cue ball's current position (not the candidate — this is the standard check)
  const dcx = px - cueBall.x, dcz = pz - cueBall.z;
  if (dcx * dcx + dcz * dcz < diam2) return false;

  return true;
}

// ─── CalculateBestShot ────────────────────────────────────────────────────────

export interface AIShot {
  shotData: ShotData;
  /** New cue ball position in Fixed-point, or null (don't move). */
  cueBallNewPos: CmVector | null;
}

/**
 * Port of BallPoolAIManager.CalculateBestShot() (:96-250).
 *
 * @param space      Physics space — provides ball positions (rigidbodies) and boards (colliders).
 *                   Boards MUST be the same object from createPoolTable (C-5 wiring).
 * @param allowable  Whether a given ball ID is allowable to pot this turn.
 * @param isFirstShot True for break shot (GameManager:665/739), false for normal (:987).
 * @param ballInHand  True when cue ball can be repositioned.
 * @param rank        AI rank 0..(rankLast-1). Higher = more accurate.
 * @param rankLast    Rank.Last value (upper exclusive bound, denominator for level01).
 * @param seed        PRNG seed for deterministic/replayable behavior.
 */
export function calculateAIShot(
  space: CmSpace,
  allowable: (id: number) => boolean,
  isFirstShot: boolean,
  ballInHand: boolean,
  rank: number,
  rankLast: number,
  seed: number,
): AIShot {
  const M = MULTIPLIER;
  const rng = makePrng(seed);

  const cueBall = getCueBallFloat(space);
  const ballsOnTable = getBallsOnTable(space);

  // Rank difficulty: higher rank = lower error probability (:150-152)
  const level01 = rank / (rankLast - 1);

  // ── State variables ──────────────────────────────────────────────────────────
  let hasTargetBall = false;
  let targetBallId: number | null = null;
  // Default cueForward: cueManager.Pivot.forward (identity fwd) = (0,0,1) in Unity space
  let cueForwardX = 0, cueForwardZ = 1;
  // cueForward2 omitted: only used for coroutine animation lerp in Unity, not in headless port
  let dot = 0;
  let distance = AI_MAX_DISTANCE;

  let cueBallPosX = cueBall.x, cueBallPosZ = cueBall.z;
  let cueBallNewX = cueBall.x, cueBallNewZ = cueBall.z;

  // ── Draw 1: moveCueBall (unconditional, :109) ─────────────────────────────
  // C# Random.Range(0,2) = int in {0,1}; 0 → moveCueBall=true
  const moveCueBall = Math.floor(rng(0, 2)) === 0;

  // ── Main loop: foreach aiPockets × foreach BallsOnTable ──────────────────
  for (const [pocketX, pocketZ] of AI_POCKETS_XZ) {
    for (const ball of ballsOnTable) {

      // Allowable filter (:116-119) — non-allowable balls draw 0 times
      if (!allowable(ball.id)) continue;

      // Ghost-ball geometry (:120-121)
      const d1x = pocketX - ball.x, d1z = pocketZ - ball.z;
      const d1mag = Math.sqrt(d1x * d1x + d1z * d1z) || 1;
      const dir1x = d1x / d1mag, dir1z = d1z / d1mag;   // normalized ball→pocket

      // targetingPoint = ball.pos - diameter * dir1 (:121)
      const tpX = ball.x - BALL_DIAM * dir1x;
      const tpZ = ball.z - BALL_DIAM * dir1z;

      // ── Ball-in-hand placement (:122-145) ───────────────────────────────
      let cuePosX = cueBallPosX, cuePosZ = cueBallPosZ;  // working cue position for this pair

      if (ballInHand) {
        if (moveCueBall && isFirstShot) {
          // Draw A1 + A2 (break random placement, :128-129)
          // C-8: delta = moveCueBall ? 0.25f : 1f — always 0.25f (dead branch logged as DIV)
          const delta = 0.25;
          const rz = rng(-1, 1);  // A1: forward (Z) offset
          const rx = rng(-1, 1);  // A2: left (-X) offset
          const npX = cueBall.x - delta * 0.7 * FIRST_QUAD.sx * rx;  // left = (-1,0,0)
          const npZ = cueBall.z + delta * 0.3 * FIRST_QUAD.sz * rz;  // forward = (0,0,1)

          if (positionIsFree(npX, npZ, ballsOnTable, cueBall)) {
            cuePosX = npX; cuePosZ = npZ;
            cueBallNewX = npX; cueBallNewZ = npZ;
            targetBallId = ball.id;
          }
        } else {
          // Normal ball-in-hand: place behind target ball (:140-141, no draws)
          const npX = ball.x - 2 * BALL_DIAM * dir1x;
          const npZ = ball.z - 2 * BALL_DIAM * dir1z;
          if (positionIsFree(npX, npZ, ballsOnTable, cueBall)) {
            cuePosX = npX; cuePosZ = npZ;
          }
        }
      }

      // ── Rank noise (draws B1, maybe B2) (:148-152) ───────────────────────
      // B1: unconditional probability check
      const b1 = rng(0, 1);
      // C-3: deltaError uses same scalar for x and z (diagonal vector)
      const deltaError = b1 <= level01 ? 0 : rng(-0.2, 0.2);  // B2 if b1 > level01

      // direction2 = normalize(deltaVector + targetingPoint - cuePosX) on XZ (:156)
      const noiseX = NOISE_R * deltaError;
      const noiseZ = NOISE_R * deltaError;  // C-3: same scalar
      const rawDX = noiseX + tpX - cuePosX;
      const rawDZ = noiseZ + tpZ - cuePosZ;
      const rawMag = Math.sqrt(rawDX * rawDX + rawDZ * rawDZ) || 1;
      const dir2x = rawDX / rawMag, dir2z = rawDZ / rawMag;

      // Alignment dot: dir1 · dir2 (:158)
      const cDot = dir1x * dir2x + dir1z * dir2z;

      // Reject shots with very low alignment (:159-167)
      if (cDot < MIN_DOT) {
        if (!hasTargetBall) { cueForwardX = dir2x; cueForwardZ = dir2z; }
        continue;
      }

      // ── Cast 1: ball→pocket path clear? (:169-177) ────────────────────
      // Exclude target ball itself; cueBall naturally included (it's in space.rigidbodies).
      const cast1MaxDist = Math.sqrt((pocketX - ball.x) ** 2 + (pocketZ - ball.z) ** 2);
      const cast1Dir = new CmVector(Math.round(dir1x * M), 0, Math.round(dir1z * M));
      const cast1From = new CmVector(Math.round(ball.x * M), space.rigidbodies[ball.id].collider.position.y, Math.round(ball.z * M));
      const hit1 = analyticSphereCast(cast1From, cast1Dir, space, cast1MaxDist, ball.id);
      if (hit1.hitType !== 'none') {
        // Path to pocket is blocked
        if (!hasTargetBall) { cueForwardX = dir2x; cueForwardZ = dir2z; }
        continue;
      }

      // ── Cast 2: cue→ghost path — does it hit the target ball? (:179-198) ─
      const cast2MaxDist = BALL_R + Math.sqrt((cuePosX - tpX) ** 2 + (cuePosZ - tpZ) ** 2);
      const cast2Dir = new CmVector(Math.round(dir2x * M), 0, Math.round(dir2z * M));
      const cast2From = new CmVector(Math.round(cuePosX * M), space.rigidbodies[0].collider.position.y, Math.round(cuePosZ * M));
      const hit2 = analyticSphereCast(cast2From, cast2Dir, space, cast2MaxDist);

      if (hit2.hitType !== 'none') {
        // Cast2 hit something — check if it's our target ball and better score (:183-193)
        const cDistance = cast1MaxDist + Math.sqrt((tpX - cuePosX) ** 2 + (tpZ - cuePosZ) ** 2);
        if (
          hit2.hitType === 'ball' && hit2.ballId === ball.id &&
          (targetBallId === null || dot / distance < cDot / cDistance)
        ) {
          dot = cDot;
          distance = cDistance;
          targetBallId = ball.id;
          cueForwardX = dir2x; cueForwardZ = dir2z;
          hasTargetBall = true;
          cueBallNewX = cuePosX; cueBallNewZ = cuePosZ;
        }
      } else if (!hasTargetBall) {
        // Cast2 missed everything within range — record as fallback direction (:194-198)
        cueForwardX = dir2x; cueForwardZ = dir2z;      }
    }
  }

  // ── Fallback: aim at nearest directly-hittable ball (:203-245) ───────────
  if (targetBallId === null) {
    distance = AI_MAX_DISTANCE;
    cueBallPosX = cueBall.x; cueBallPosZ = cueBall.z;

    for (const ball of ballsOnTable) {
      if (!allowable(ball.id)) continue;

      let cuePosX = cueBallPosX, cuePosZ = cueBallPosZ;

      if (ballInHand) {
        // Fallback ball-in-hand: angular search 0-8° (:217-228, step=1, no draws)
        let foundPosition = false;
        for (let angle = 0; !foundPosition && angle <= 8; angle += 1) {
          const sin = Math.sin(angle * Math.PI / 4);
          const cos = Math.cos(angle * Math.PI / 4);
          // C#: +z=forward, -x=right → npX = ball.x - 2*diam*sin, npZ = ball.z - 2*diam*cos
          const npX = ball.x - 2 * BALL_DIAM * sin;
          const npZ = ball.z - 2 * BALL_DIAM * cos;
          if (positionIsFree(npX, npZ, ballsOnTable, cueBall)) {
            cuePosX = npX; cuePosZ = npZ;
            foundPosition = true;
          }
        }
      }

      // Aim direction: cue→ball XZ (:230)
      const dx = ball.x - cuePosX, dz = ball.z - cuePosZ;
      const mag = Math.sqrt(dx * dx + dz * dz) || 1;
      const dir2x = dx / mag, dir2z = dz / mag;

      // Cast2 (no exclusion) to verify cue can hit this ball (:232)
      const cast2MaxDist = Math.sqrt((cuePosX - ball.x) ** 2 + (cuePosZ - ball.z) ** 2);
      const cast2Dir = new CmVector(Math.round(dir2x * M), 0, Math.round(dir2z * M));
      const cast2From = new CmVector(Math.round(cuePosX * M), space.rigidbodies[0].collider.position.y, Math.round(cuePosZ * M));
      const hit2 = analyticSphereCast(cast2From, cast2Dir, space, cast2MaxDist);

      if (hit2.hitType !== 'none') {
        const cDistance = 2 * Math.sqrt((cuePosX - ball.x) ** 2 + (cuePosZ - ball.z) ** 2);  // :234
        if (hit2.hitType === 'ball' && hit2.ballId === ball.id &&
            (targetBallId === null || distance > cDistance)) {
          distance = cDistance;
          targetBallId = ball.id;
          cueForwardX = dir2x; cueForwardZ = dir2z;
          cueBallNewX = cuePosX; cueBallNewZ = cuePosZ;
        }
      }
    }
  }

  // ── Force (draw F, :248-249) ──────────────────────────────────────────────
  // forceKoef = Clamp((distance/maxDistance) / Clamp(dot, 0.5, 1), 0.15, 1)
  const clampedDot = Math.max(0.5, Math.min(1, dot));
  const forceKoef = Math.max(0.15, Math.min(1, (distance / AI_MAX_DISTANCE) / clampedDot));
  const maxForceUnity = forceKoef * rng(0.9 * (AI_MAX_FORCE_FIXED / M), AI_MAX_FORCE_FIXED / M);

  // Convert to Fixed-point impulse in XZ plane (Y=0 for horizontal shot)
  const impulseX = Math.trunc(maxForceUnity * cueForwardX * M);
  const impulseZ = Math.trunc(maxForceUnity * cueForwardZ * M);

  const newPosFixed = new CmVector(
    Math.round(cueBallNewX * M),
    space.rigidbodies[0].collider.position.y,
    Math.round(cueBallNewZ * M),
  );

  const didMoveCueBall = (
    Math.abs(cueBallNewX - cueBall.x) > 1e-6 ||
    Math.abs(cueBallNewZ - cueBall.z) > 1e-6
  );

  return {
    shotData: {
      position: newPosFixed,
      impulse: new CmVector(impulseX, 0, impulseZ),
      torque: CmVector.zero,
    },
    cueBallNewPos: didMoveCueBall ? newPosFixed : null,
  };
}
