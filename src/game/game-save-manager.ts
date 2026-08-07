/**
 * P1-T09 — mid-game save / resume (DATA-001 single-player).
 * C# GameSaveManager: SaveGameState / IsSavedGame / GetGameState.
 *
 * Saved payload:
 *   g = rule-engine serialize (GameLogicStateV1)
 *   p = physics getStateAsString (PHY-013)
 *   t = last shot wall-clock ms
 *   TTL = 1.5 × shotTimeS (Unity 1.5×shotDeltaTime)
 */

import type { GameLogicStateV1 } from './rule-engine';
import { DEFAULT_SHOT_TIME_S, GAME_END_TIME_RATIO } from '../renderer/shot-timer';

export const GAME_SAVE_LS_KEY = 'pool.savedGame.v1';

export interface SavedGameDataV1 {
  readonly v: 1;
  /** Rule engine state */
  g: GameLogicStateV1;
  /** Physics CmSpace state string (PHY-013) */
  p: string;
  /** Last activity timestamp (ms since epoch) */
  t: number;
  /** Shot time budget used for TTL (seconds) */
  shotTimeS: number;
  /** Session phase hint */
  phase: 'Aiming' | 'BallInHand';
  currentPlayerIndex: 0 | 1;
  ballInHand: boolean;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function _defaultStorage(): StorageLike {
  if (typeof localStorage !== 'undefined') return localStorage;
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export interface GameSaveManager {
  saveGameState(data: Omit<SavedGameDataV1, 'v' | 't'> & { t?: number }): void;
  getGameState(): SavedGameDataV1 | null;
  /**
   * True if a save exists and is within TTL window.
   * TTL = shotTimeS * GAME_END_TIME_RATIO (default 1.5×) from last activity.
   */
  isSavedGame(nowMs?: number): boolean;
  clearGameState(): void;
}

export function createGameSaveManager(
  storage: StorageLike = _defaultStorage(),
  opts?: { nowMs?: () => number },
): GameSaveManager {
  const now = opts?.nowMs ?? (() => Date.now());

  function _read(): SavedGameDataV1 | null {
    const raw = storage.getItem(GAME_SAVE_LS_KEY);
    if (!raw) return null;
    try {
      const j = JSON.parse(raw) as SavedGameDataV1;
      if (j.v !== 1 || typeof j.p !== 'string' || !j.g) return null;
      return j;
    } catch {
      return null;
    }
  }

  return {
    saveGameState(data): void {
      const payload: SavedGameDataV1 = {
        v: 1,
        g: data.g,
        p: data.p,
        t: data.t ?? now(),
        shotTimeS: data.shotTimeS > 0 ? data.shotTimeS : DEFAULT_SHOT_TIME_S,
        phase: data.phase,
        currentPlayerIndex: data.currentPlayerIndex,
        ballInHand: data.ballInHand,
      };
      storage.setItem(GAME_SAVE_LS_KEY, JSON.stringify(payload));
    },

    getGameState(): SavedGameDataV1 | null {
      return _read();
    },

    isSavedGame(nowMs?: number): boolean {
      const s = _read();
      if (!s) return false;
      const ttlMs = (s.shotTimeS || DEFAULT_SHOT_TIME_S) * GAME_END_TIME_RATIO * 1000;
      const t = nowMs ?? now();
      return t - s.t < ttlMs && t - s.t >= 0;
    },

    clearGameState(): void {
      storage.removeItem(GAME_SAVE_LS_KEY);
    },
  };
}

let _defaultSave: GameSaveManager | null = null;

export function getDefaultGameSaveManager(): GameSaveManager {
  if (!_defaultSave) _defaultSave = createGameSaveManager();
  return _defaultSave;
}

export function _resetDefaultGameSaveManagerForTests(): void {
  _defaultSave = null;
}
