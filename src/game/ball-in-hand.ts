/**
 * CUE-013: ball-in-hand placement controller.
 *
 * Matches C# CueBallMoveManager: SelectBall/MoveBall/UnselectBall/PositionIsFree.
 * Zone = fullQuad (full table) for P1-T02; firstQuad (head string) wired by P1-T03.
 * placeBall() on commit routes through IBallPoolPhysics — deterministic Fixed pos.
 */

import { CmVector } from '../physics/cm-vector';
import { MULTIPLIER } from '../physics/fixed-math';
import {
  BALL_Y, BALL_RADIUS,
  RAIL_LONG_X, RAIL_BACK_Z,
} from '../physics/constants';
import type { IBallPoolPhysics, BallState } from './ball-pool-physics';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * C# PositionIsFree: overlap threshold = 1.25 * Diameter = 1.25 * 2 * BALL_RADIUS.
 * Gives a 25% extra clearance margin around each ball.
 */
export const MIN_OVERLAP_DIST = Math.trunc(1.25 * 2 * BALL_RADIUS);

// ─── PlacementZone ────────────────────────────────────────────────────────────

export interface PlacementZone {
  readonly minX: number;  // Fixed
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Full table — default zone (all fouls except initial break). */
export const FULL_QUAD: PlacementZone = {
  minX: -(RAIL_LONG_X - BALL_RADIUS),
  maxX:   RAIL_LONG_X - BALL_RADIUS,
  minZ: -(RAIL_BACK_Z - BALL_RADIUS),
  maxZ:   RAIL_BACK_Z - BALL_RADIUS,
};

/** Head-string zone — behind the head string (cue-ball side, break foul). */
export const FIRST_QUAD: PlacementZone = {
  minX: -(RAIL_LONG_X - BALL_RADIUS),
  maxX:  -BALL_RADIUS,
  minZ: -(RAIL_BACK_Z - BALL_RADIUS),
  maxZ:   RAIL_BACK_Z - BALL_RADIUS,
};

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/** Clamp Fixed XZ position to the placement zone. Y unchanged. */
export function clampToZone(x: number, z: number, zone: PlacementZone): { x: number; z: number } {
  return {
    x: Math.max(zone.minX, Math.min(zone.maxX, x)),
    z: Math.max(zone.minZ, Math.min(zone.maxZ, z)),
  };
}

/**
 * Check that `pos` is inside `zone` and does not overlap any ball in `balls`
 * (excluding the ball with id=`excludeId`).
 *
 * Matches C# CueBallMoveManager.PositionIsFree: distance < 1.25 * Diameter.
 */
export function isPositionFree(
  pos: CmVector,
  balls: readonly BallState[],
  excludeId: number,
  zone: PlacementZone,
): boolean {
  if (pos.x < zone.minX || pos.x > zone.maxX || pos.z < zone.minZ || pos.z > zone.maxZ) {
    return false;
  }
  const threshold2 = MIN_OVERLAP_DIST * MIN_OVERLAP_DIST;
  for (const ball of balls) {
    if (ball.id === excludeId) continue;
    const dx = ball.position.x - pos.x;
    const dy = ball.position.y - pos.y;
    const dz = ball.position.z - pos.z;
    if (dx * dx + dy * dy + dz * dz < threshold2) return false;
  }
  return true;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export interface BallInHandController {
  /** True while ball-in-hand mode is active. */
  readonly isActive: boolean;
  /** Current proposed Fixed position, or null when idle. */
  readonly proposedPosition: CmVector | null;
  /** Whether the proposed position is legal (free + in bounds). */
  readonly proposedIsFree: boolean;

  /** Activate ball-in-hand mode. Zone defaults to fullQuad. */
  enter(zone?: PlacementZone): void;

  /**
   * Update proposed position from a table-plane point (float meters).
   * Clamps to zone and recomputes proposedIsFree. No-op when idle.
   */
  move(tableX: number, tableZ: number): void;

  /**
   * Commit placement at the proposed position.
   * Calls physics.placeBall() and returns true on success.
   * Returns false (no-op) when idle or proposedIsFree is false.
   */
  commit(): boolean;

  /** Cancel without placing — returns to idle. */
  cancel(): void;
}

export function createBallInHandController(
  physics: IBallPoolPhysics,
  ballId = 0,
): BallInHandController {
  let _active = false;
  let _zone: PlacementZone = FULL_QUAD;
  let _proposed: CmVector | null = null;
  let _isFree = false;

  function _update(fixedX: number, fixedZ: number): void {
    const { x: cx, z: cz } = clampToZone(fixedX, fixedZ, _zone);
    _proposed = new CmVector(cx, BALL_Y, cz);
    _isFree = isPositionFree(_proposed, physics.allBalls, ballId, _zone);
  }

  return {
    get isActive(): boolean { return _active; },
    get proposedPosition(): CmVector | null { return _proposed; },
    get proposedIsFree(): boolean { return _isFree; },

    enter(zone: PlacementZone = FULL_QUAD): void {
      _active = true;
      _zone = zone;
      const cueBall = physics.getBall(ballId);
      _update(cueBall.position.x, cueBall.position.z);
    },

    move(tableX: number, tableZ: number): void {
      if (!_active) return;
      _update(Math.round(tableX * MULTIPLIER), Math.round(tableZ * MULTIPLIER));
    },

    commit(): boolean {
      if (!_active || !_proposed || !_isFree) return false;
      physics.placeBall(ballId, _proposed);
      _active = false;
      _proposed = null;
      _isFree = false;
      return true;
    },

    cancel(): void {
      _active = false;
      _proposed = null;
      _isFree = false;
    },
  };
}
