/**
 * P1-T02: CueController — cue stick interaction domain logic.
 *
 * Receives table-plane drag events (float world coords, meters) and routes
 * shots through IBallPoolPhysics. Never polls input — CUE-006 fix.
 *
 * CUE-012: dragDistToForce() replaces Unity AnimationCurve with a deterministic
 *           piecewise-linear mapping. Same float input → same Fixed integer output,
 *           every call, no sampled spline variance.
 *
 * MON-018: hasEnergy() always returns true — energy system not yet implemented.
 *
 * All physics interaction routes through IBallPoolPhysics:
 *   applyShot / predictAimLine / getBall / isSimulating.
 */

import { CmVector } from '../physics/cm-vector';
import { MULTIPLIER } from '../physics/fixed-math';
import type { Fixed } from '../physics/fixed-math';
import { MAX_FORCE } from '../physics/constants';
import type { IBallPoolPhysics, AimHit } from './ball-pool-physics';
import {
  distToWallMeters, computeMinVerticalAngle, applyAutoLift,
  MIN_VERTICAL_ANGLE, MAX_VERTICAL_ANGLE,
} from './cue-vertical';

/** Drag distance (meters) that maps to MAX_FORCE. */
export const CUE_MAX_DRAG = 1.5;

/** Minimum drag (meters) required to fire a shot. Exclusive lower bound. */
export const CUE_MIN_DRAG = 0.01;

/**
 * CUE-005: Maximum spin torque magnitude at full power + full offset (Fixed units).
 * Matches C# default cueItemData.maxSpin = 0.5 × maxForce = 0.5 × 65000 = 32500.
 */
export const CUE_MAX_SPIN = Math.trunc(MAX_FORCE / 2); // 32500

/** Table plane coordinate (float world coords, y implicit = ball height). */
export interface TablePoint { x: number; z: number; }

export interface CueController {
  /** Current input phase. */
  readonly phase: 'idle' | 'aiming';

  /** Begin a drag sequence. Transitions idle → aiming. */
  onDragStart(point: TablePoint): void;

  /** Update aim direction during drag. No-op if called before onDragStart. */
  onDragMove(point: TablePoint): void;

  /**
   * Finish drag and attempt to fire.
   * Returns true if applyShot was called; false if guarded (simulating / sub-threshold / no energy).
   * Always transitions back to idle.
   */
  onDragEnd(point: TablePoint): boolean;

  /** Cancel an in-progress drag without firing (e.g. two-touch interrupt). No-op when idle. */
  cancel(): void;

  /** Power fraction [0, 1] for UI bar. 0 when idle or at drag origin. */
  getPowerFraction(): number;

  /**
   * Aim-line preview. Calls predictAimLine on the current drag direction.
   * Returns null when idle, at drag origin, or direction is near-zero.
   */
  getAimHit(): AimHit | null;

  /** MON-018 stub — always true until energy system is implemented. */
  hasEnergy(): boolean;

  /**
   * CUE-012: deterministic linear force mapping.
   * dragDistToForce(0) === 0; dragDistToForce(CUE_MAX_DRAG) === MAX_FORCE.
   * Clamped to [0, MAX_FORCE]. Returns a Fixed integer (truncated).
   */
  dragDistToForce(distMeters: number): Fixed;

  /**
   * CUE-005: Set the spin offset for the next shot.
   * x = side english ∈ [-1, 1]: negative = right, positive = left.
   * y = top/back spin ∈ [-1, 1]: positive = topspin, negative = backspin.
   * Persists across shots; reset by calling setSpinOffset(0, 0).
   */
  setSpinOffset(x: number, y: number): void;

  /** CUE-005: Read the current spin offset. */
  getSpinOffset(): { x: number; y: number };

  /**
   * CUE-004: Set the user-requested vertical (elevation) angle in degrees [0, 70].
   * The effective angle may be higher if CUE-015 auto-lift applies.
   */
  setVerticalAngle(deg: number): void;

  /**
   * CUE-004: Get the effective vertical angle (degrees) — max(userAngle, autoLiftAngle).
   * Updated each onDragMove; 0 when idle or no aim direction.
   */
  getVerticalAngle(): number;

  /**
   * CUE-019: Whether this cue is the active player's cue.
   * Defaults to true so existing tests need no change.
   * Set false during simulation / opponent's turn.
   */
  readonly isEnabled: boolean;

  /** CUE-019: Enable cue input (called by P1-T03 rules on turn start). */
  enable(): void;

  /** CUE-019: Disable cue input + cancel any drag. Maps to C# TriggerThis(false). */
  disable(): void;

  /**
   * CUE-002: Fire with explicit power fraction + last known aim direction.
   * Enables slider-based shooting without requiring a drag-end gesture.
   * Returns false if: no aim state saved, physics simulating, or forceFraction = 0.
   * Does NOT check isEnabled — slider fires independently of the CUE-019 drag mutex.
   */
  fireNow(forceFraction: number): boolean;

  /**
   * CUE-020: Reset cue parameters for the next turn, then enable.
   * Matches C# CueManager.ResetState() + ResetParameters():
   *   zeros backswing / verticalAngle / spinOffset / drag state, enables cue.
   * Called by P1-T03 rules after simulation ends. Never called internally.
   */
  resetForNewTurn(): void;

  /**
   * CUE-008: Whether the aim line is shown during aiming.
   * Maps to C# CueShotManager.IsAutoShot (the UI toggle that shows/hides hitLine).
   * Defaults to true. Persists across turns (user preference).
   */
  readonly aimLineVisible: boolean;

  /** CUE-008: Flip aim line visibility. Called by UI toggle button. */
  toggleAimLine(): void;
}

export function createCueController(physics: IBallPoolPhysics, cueBallId = 0): CueController {
  let _phase: 'idle' | 'aiming' = 'idle';
  let _startPoint: TablePoint | null = null;
  let _currentPoint: TablePoint | null = null;
  // CUE-002: saved aim state for fireNow() — persists after onDragEnd
  let _lastAimStart: TablePoint | null = null;
  let _lastAimCurrent: TablePoint | null = null;
  let _spinX = 0;  // CUE-005 side english ∈ [-1, 1]
  let _spinY = 0;  // CUE-005 top/back spin ∈ [-1, 1]
  let _userVertAngle = 0;   // CUE-004: user-set elevation (degrees)
  let _effectiveVertAngle = 0;  // CUE-015: max(user, auto-lift)
  let _isEnabled = true;    // CUE-019: true = active player's turn (default for compat)
  let _aimLineVisible = true;  // CUE-008: user preference, persists across turns

  function planeDistXZ(a: TablePoint, b: TablePoint): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function hasEnergy(): boolean { return true; }

  // CUE-015: recompute auto-lift angle whenever aim direction changes
  function _updateAutoLift(nx: number, nz: number): void {
    const cueBall = physics.getBall(cueBallId);
    const cueBallF = {
      x: cueBall.position.x / MULTIPLIER,
      z: cueBall.position.z / MULTIPLIER,
    };
    // Handle direction = −aimDir; wall is behind the cue ball (where the handle swings)
    const handleWall = distToWallMeters(cueBallF.x, cueBallF.z, -nx, -nz);
    const otherBalls = physics.allBalls
      .filter(b => b.id !== cueBallId && !b.isKinematic && !b.isOutOfTable)
      .map(b => ({ x: b.position.x / MULTIPLIER, z: b.position.z / MULTIPLIER }));
    const minAngle = computeMinVerticalAngle(cueBallF, { x: nx, z: nz }, otherBalls, handleWall);
    _effectiveVertAngle = applyAutoLift(_userVertAngle, minAngle);
  }

  function dragDistToForce(distMeters: number): Fixed {
    const clamped = Math.max(0, Math.min(distMeters / CUE_MAX_DRAG, 1.0));
    return Math.trunc(clamped * MAX_FORCE);
  }

  return {
    get phase() { return _phase; },

    onDragStart(point: TablePoint): void {
      if (!_isEnabled) return;  // CUE-019: no input while disabled
      _phase = 'aiming';
      _startPoint = point;
      _currentPoint = point;
      // CUE-002: save aim state for fireNow()
      _lastAimStart = point;
      _lastAimCurrent = point;
    },

    onDragMove(point: TablePoint): void {
      if (_phase !== 'aiming') return;
      _currentPoint = point;
      _lastAimCurrent = point;  // CUE-002: keep saved aim in sync
      // CUE-015: recompute auto-lift on every aim update
      if (_startPoint) {
        const dx = _startPoint.x - point.x;
        const dz = _startPoint.z - point.z;
        const nd = Math.sqrt(dx * dx + dz * dz);
        if (nd >= 0.001) _updateAutoLift(dx / nd, dz / nd);
      }
    },

    onDragEnd(point: TablePoint): boolean {
      const start = _startPoint;
      _phase = 'idle';
      _startPoint = null;
      _currentPoint = null;

      if (!start) return false;
      if (physics.isSimulating) return false;
      if (!hasEnergy()) return false;

      const d = planeDistXZ(start, point);
      if (d < CUE_MIN_DRAG) return false;

      const dx = start.x - point.x;
      const dz = start.z - point.z;
      const nd = Math.sqrt(dx * dx + dz * dz);
      const nx = dx / nd;
      const nz = dz / nd;
      const force = dragDistToForce(d);

      // CUE-005/CUE-012: torque synthesis from spin offset + aim direction.
      // C# formula: torque = maxSpin * force * (-spinX * worldUp + spinY * slider.right)
      // slider.right (horizontal, perpendicular to aim) = (-nz, 0, nx)
      const spinMag = Math.trunc(force * CUE_MAX_SPIN / MAX_FORCE);
      // Use `|| 0` on each component to collapse -0 (IEEE 754 negative zero) to 0.
      const torque = (_spinX === 0 && _spinY === 0 || spinMag === 0)
        ? CmVector.zero
        : new CmVector(
            Math.trunc(_spinY * spinMag * (-nz)) || 0,  // top/back → X
            Math.trunc(-_spinX * spinMag) || 0,          // side english → Y
            Math.trunc(_spinY * spinMag * nx) || 0,      // top/back → Z
          );

      const cueBall = physics.getBall(cueBallId);
      physics.applyShot({
        position: cueBall.position,
        impulse: new CmVector(
          Math.trunc(nx * force),
          0,
          Math.trunc(nz * force),
        ),
        torque,
      });
      return true;
    },

    fireNow(forceFraction: number): boolean {
      if (!_lastAimStart || !_lastAimCurrent) return false;
      if (physics.isSimulating) return false;

      const dx = _lastAimStart.x - _lastAimCurrent.x;
      const dz = _lastAimStart.z - _lastAimCurrent.z;
      const nd = Math.sqrt(dx * dx + dz * dz);
      if (nd < 0.001) return false;

      const clamped = Math.max(0, Math.min(1, forceFraction));
      const force = Math.trunc(clamped * MAX_FORCE);
      if (force === 0) return false;

      const nx = dx / nd;
      const nz = dz / nd;

      const spinMag = Math.trunc(force * CUE_MAX_SPIN / MAX_FORCE);
      const torque = (_spinX === 0 && _spinY === 0 || spinMag === 0)
        ? CmVector.zero
        : new CmVector(
            Math.trunc(_spinY * spinMag * (-nz)) || 0,
            Math.trunc(-_spinX * spinMag) || 0,
            Math.trunc(_spinY * spinMag * nx) || 0,
          );

      const cueBall = physics.getBall(cueBallId);
      physics.applyShot({
        position: cueBall.position,
        impulse: new CmVector(
          Math.trunc(nx * force),
          0,
          Math.trunc(nz * force),
        ),
        torque,
      });
      return true;
    },

    cancel(): void {
      _phase = 'idle';
      _startPoint = null;
      _currentPoint = null;
    },

    getPowerFraction(): number {
      if (!_startPoint || !_currentPoint) return 0;
      return Math.min(planeDistXZ(_startPoint, _currentPoint) / CUE_MAX_DRAG, 1.0);
    },

    getAimHit(): AimHit | null {
      if (_phase !== 'aiming' || !_startPoint || !_currentPoint) return null;
      const dx = _startPoint.x - _currentPoint.x;
      const dz = _startPoint.z - _currentPoint.z;
      const nd = Math.sqrt(dx * dx + dz * dz);
      if (nd < 0.001) return null;
      const nx = dx / nd;
      const nz = dz / nd;
      const cueBall = physics.getBall(cueBallId);
      return physics.predictAimLine(
        cueBall.position,
        new CmVector(Math.trunc(nx * MULTIPLIER), 0, Math.trunc(nz * MULTIPLIER)),
      );
    },

    hasEnergy,
    dragDistToForce,

    setSpinOffset(x: number, y: number): void {
      _spinX = Math.max(-1, Math.min(1, x));
      _spinY = Math.max(-1, Math.min(1, y));
    },

    getSpinOffset(): { x: number; y: number } {
      return { x: _spinX, y: _spinY };
    },

    setVerticalAngle(deg: number): void {
      _userVertAngle = Math.max(MIN_VERTICAL_ANGLE, Math.min(MAX_VERTICAL_ANGLE, deg));
      // Re-apply auto-lift against the new user angle if currently aiming
      if (_phase === 'aiming' && _startPoint && _currentPoint) {
        const dx = _startPoint.x - _currentPoint.x;
        const dz = _startPoint.z - _currentPoint.z;
        const nd = Math.sqrt(dx * dx + dz * dz);
        if (nd >= 0.001) _updateAutoLift(dx / nd, dz / nd);
      } else {
        _effectiveVertAngle = _userVertAngle;
      }
    },

    getVerticalAngle(): number {
      return _effectiveVertAngle;
    },

    get isEnabled() { return _isEnabled; },

    enable(): void {
      _isEnabled = true;
    },

    disable(): void {
      _isEnabled = false;
      // Cancel any in-progress drag (matches C# TriggerManagers(false))
      _phase = 'idle';
      _startPoint = null;
      _currentPoint = null;
    },

    resetForNewTurn(): void {
      // Matches C# ResetParameters() + enable
      _userVertAngle = 0;
      _effectiveVertAngle = 0;
      _spinX = 0;
      _spinY = 0;
      // Cancel any drag (matches C# shotManager.ResetShot() + cueBackswingZ = 0)
      _phase = 'idle';
      _startPoint = null;
      _currentPoint = null;
      _isEnabled = true;
      // _aimLineVisible intentionally NOT reset — user preference persists across turns
    },

    get aimLineVisible() { return _aimLineVisible; },

    toggleAimLine(): void {
      _aimLineVisible = !_aimLineVisible;
    },
  };
}
