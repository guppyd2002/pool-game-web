/**
 * CUE-011: Shot punch animation — pure math functions.
 *
 * C# source: CueManager.cs
 *   - Backswing: slider.localPosition.z = -0.25f * cueBackswingZ (cueBackswingZ = force01)
 *   - AnimateCueOnShot: Lerp(localPosition, Vector3.zero, t) over shotTime = 0.1f
 */

/** Matches C# CueManager.shotTime = 0.1f. */
export const SHOT_ANIM_DURATION = 0.1;

/** Matches C# -0.25 * cueBackswingZ at force01 = 1.0. */
export const CUE_MAX_BACKSWING = 0.25;

/**
 * Cue stick pullback distance (meters) for a given power fraction [0, 1].
 * Maps powerFraction → local Z offset applied behind the cue ball pivot.
 */
export function backswingOffset(powerFraction: number): number {
  return Math.max(0, Math.min(1, powerFraction)) * CUE_MAX_BACKSWING;
}

/**
 * Cue Z offset (meters) at a given point in the punch animation.
 * Lerps linearly from startOffset → 0 over [0, duration].
 * Returns 0 once elapsed >= duration (or duration <= 0).
 */
export function shotPunchOffset(elapsed: number, duration: number, startOffset: number): number {
  if (duration <= 0 || elapsed >= duration) return 0;
  return startOffset * (1 - elapsed / duration);
}
