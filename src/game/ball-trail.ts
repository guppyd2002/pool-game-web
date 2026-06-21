/**
 * GAME-013 — cue ball trail toggle.
 * Port of C# BallManager.SelectBall / UnselectBall (trailRenderer).
 *
 * C# SelectBall:   trailRenderer.enabled = false
 * C# UnselectBal:  trailRenderer.SetPositions(new Vector3[0]); trailRenderer.enabled = true
 *
 * Web: abstraction layer; actual THREE.TrailRenderer / Line is attached by
 * the renderer caller. This module tracks enabled state and notifies listeners.
 */

export interface BallTrail {
  readonly isEnabled: boolean;
  /** C# SelectBall: disable trail (ball-in-hand enter). */
  disable(): void;
  /** C# UnselectBal: clear trail history and re-enable (ball placed). */
  enable(): void;
  /** Subscribe to enable/disable changes; returns unsubscribe fn. */
  onChange(fn: (enabled: boolean) => void): () => void;
}

export function createBallTrail(): BallTrail {
  let _enabled = true;
  const _listeners = new Set<(enabled: boolean) => void>();

  function _notify(): void {
    for (const fn of _listeners) fn(_enabled);
  }

  return {
    get isEnabled() { return _enabled; },

    disable(): void {
      if (_enabled) {
        _enabled = false;
        _notify();
      }
    },

    enable(): void {
      if (!_enabled) {
        _enabled = true;
        _notify();
      }
    },

    onChange(fn: (enabled: boolean) => void): () => void {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
  };
}
