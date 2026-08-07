/**
 * UI-024 / RULE-006 — client-side shot countdown (P1-T07).
 *
 * C# BallPoolGameLogic: ShotTime, GameEndTime = 1.5×ShotTime.
 * Wall-clock lives here; pure rule outcomes via session.notifyShotTimeout /
 * notifyGameEndTimeout (rule-engine applyTimeout / applyGameEndTimeout).
 *
 * Pure helpers are unit-tested; createShotTimer is browser-only (RAF/setInterval).
 *
 * Product switch (CEO-facing wall-clock only — does NOT delete engine fidelity):
 *   WALL_CLOCK_SHOT_TIMER_ENABLED=false → createShotTimer.start() is no-op;
 *   applyTimeout / applyGameEndTimeout / notifyShotTimeout remain available for tests
 *   and future re-enable. Flip to true to restore 30s client countdown.
 */

/**
 * When false, the live HUD shot clock never starts and never fires wall-clock fouls.
 * Engine RULE-006 methods stay intact (Unity fidelity). Set true to re-enable.
 * Prepared for CEO "撤" — default false on this prep branch only until merged.
 */
export const WALL_CLOCK_SHOT_TIMER_ENABLED = false;

/** Default per-shot budget in seconds (Unity inspector typical ~30). */
export const DEFAULT_SHOT_TIME_S = 30;

/** C# GameEndTime => (3 * ShotTime) / 2 */
export const GAME_END_TIME_RATIO = 1.5;

export type TimerTier = 'ok' | 'shot_timeout' | 'game_end_timeout';

/** Which RULE-006 tier elapsed time falls into. */
export function computeTimerTier(
  elapsedS: number,
  shotTimeS: number = DEFAULT_SHOT_TIME_S,
): TimerTier {
  const gameEnd = shotTimeS * GAME_END_TIME_RATIO;
  if (elapsedS >= gameEnd) return 'game_end_timeout';
  if (elapsedS >= shotTimeS) return 'shot_timeout';
  return 'ok';
}

/**
 * Seconds remaining for HUD display.
 * Before ShotTime: ShotTime − elapsed.
 * In grace band to GameEndTime: GameEndTime − elapsed (C# RemainingTime = 2*ShotTime − spent after first timeout path).
 */
export function remainingDisplayS(
  elapsedS: number,
  shotTimeS: number = DEFAULT_SHOT_TIME_S,
): number {
  const gameEnd = shotTimeS * GAME_END_TIME_RATIO;
  if (elapsedS >= gameEnd) return 0;
  if (elapsedS >= shotTimeS) return Math.max(0, gameEnd - elapsedS);
  return Math.max(0, shotTimeS - elapsedS);
}

export function isInGracePeriod(
  elapsedS: number,
  shotTimeS: number = DEFAULT_SHOT_TIME_S,
): boolean {
  return elapsedS >= shotTimeS && elapsedS < shotTimeS * GAME_END_TIME_RATIO;
}

export interface ShotTimer {
  /** Start/restart countdown for a new turn (Aiming). */
  start(): void;
  /** Stop ticking (InShot, BallInHand, GameOver, MainMenu). */
  stop(): void;
  dispose(): void;
}

/**
 * Interval timer for live HUD. Fires shot-timeout once then game-end once per start().
 */
export function createShotTimer(opts: {
  onTick: (remainingS: number, inGrace: boolean) => void;
  onShotTimeout: () => void;
  onGameEndTimeout: () => void;
  shotTimeS?: number;
  /** Inject clock for tests (ms). */
  nowMs?: () => number;
}): ShotTimer {
  const shotTimeS = opts.shotTimeS ?? DEFAULT_SHOT_TIME_S;
  const now = opts.nowMs ?? (() => performance.now());
  let _startMs = 0;
  let _interval = 0;
  let _shotFired = false;
  let _gameEndFired = false;

  function _tick(): void {
    const elapsed = (now() - _startMs) / 1000;
    const rem = remainingDisplayS(elapsed, shotTimeS);
    const grace = isInGracePeriod(elapsed, shotTimeS);
    opts.onTick(rem, grace);

    const tier = computeTimerTier(elapsed, shotTimeS);
    if (tier === 'shot_timeout' && !_shotFired) {
      _shotFired = true;
      opts.onShotTimeout();
    }
    if (tier === 'game_end_timeout' && !_gameEndFired) {
      _gameEndFired = true;
      opts.onGameEndTimeout();
      stop();
    }
  }

  function stop(): void {
    if (_interval) {
      window.clearInterval(_interval);
      _interval = 0;
    }
  }

  return {
    start(): void {
      stop();
      // Product kill-switch: leave engine notify* paths unused by never ticking.
      if (!WALL_CLOCK_SHOT_TIMER_ENABLED) {
        // One tick so the host can clear HUD (main maps this → setTimer(null) when disabled).
        opts.onTick(shotTimeS, false);
        return;
      }
      _startMs = now();
      _shotFired = false;
      _gameEndFired = false;
      opts.onTick(shotTimeS, false);
      _interval = window.setInterval(_tick, 200);
    },
    stop,
    dispose(): void {
      stop();
    },
  };
}
