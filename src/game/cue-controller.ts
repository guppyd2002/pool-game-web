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

/** Drag distance (meters) that maps to MAX_FORCE. */
export const CUE_MAX_DRAG = 1.5;

/** Minimum drag (meters) required to fire a shot. Exclusive lower bound. */
export const CUE_MIN_DRAG = 0.01;

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
}

export function createCueController(physics: IBallPoolPhysics, cueBallId = 0): CueController {
  let _phase: 'idle' | 'aiming' = 'idle';
  let _startPoint: TablePoint | null = null;
  let _currentPoint: TablePoint | null = null;

  function planeDistXZ(a: TablePoint, b: TablePoint): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function hasEnergy(): boolean { return true; }

  function dragDistToForce(distMeters: number): Fixed {
    const clamped = Math.max(0, Math.min(distMeters / CUE_MAX_DRAG, 1.0));
    return Math.trunc(clamped * MAX_FORCE);
  }

  return {
    get phase() { return _phase; },

    onDragStart(point: TablePoint): void {
      _phase = 'aiming';
      _startPoint = point;
      _currentPoint = point;
    },

    onDragMove(point: TablePoint): void {
      if (_phase !== 'aiming') return;
      _currentPoint = point;
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

      const cueBall = physics.getBall(cueBallId);
      physics.applyShot({
        position: cueBall.position,
        impulse: new CmVector(
          Math.trunc(nx * force),
          0,
          Math.trunc(nz * force),
        ),
        torque: CmVector.zero,
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
  };
}
