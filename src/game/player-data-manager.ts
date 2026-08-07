/**
 * P1-T09 — PlayerDataManager (DATA-004 / DATA-010).
 * C# PlayerDataManager: GetPlayerData / SavePlayerData / DeletePlayerData.
 * Web: localStorage JSON (PlayerPrefs equivalent). Migrates T07/T08 scattered keys.
 */

import {
  type PlayerData,
  type PlayerDataJSON,
  DEFAULT_PLAYER_DATA,
  DEFAULT_OWNED_CUES,
  toPlayerDataJSON,
  fromPlayerDataJSON,
  copyMainData,
} from './player-data';

export const PLAYER_DATA_LS_KEY = 'pool.playerData.v1';

// Legacy keys from T07/T08 — migrated once then left alone
const LEGACY_NAME = 'pool.profile.name';
const LEGACY_AVATAR = 'pool.profile.avatar';
const LEGACY_CUE = 'pool.cue.equipped';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function _defaultStorage(): StorageLike {
  if (typeof localStorage !== 'undefined') return localStorage;
  // Node/vitest fallback
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export interface PlayerDataManager {
  getPlayerData(): PlayerData;
  savePlayerData(data: PlayerData): void;
  deletePlayerData(): void;
  /** Subscribe to saves (DATA-006 UI refresh). */
  subscribe(fn: (data: PlayerData) => void): () => void;
}

export function createPlayerDataManager(storage: StorageLike = _defaultStorage()): PlayerDataManager {
  const listeners = new Set<(data: PlayerData) => void>();
  let cache: PlayerData | null = null;

  function _migrateLegacy(): PlayerData | null {
    const name = storage.getItem(LEGACY_NAME);
    const avatar = storage.getItem(LEGACY_AVATAR);
    const cue = storage.getItem(LEGACY_CUE);
    if (name == null && avatar == null && cue == null) return null;
    return {
      ...DEFAULT_PLAYER_DATA,
      name: name?.trim() || DEFAULT_PLAYER_DATA.name,
      avatar: avatar || DEFAULT_PLAYER_DATA.avatar,
      cueId: cue && DEFAULT_OWNED_CUES.includes(cue as typeof DEFAULT_OWNED_CUES[number])
        ? cue
        : DEFAULT_PLAYER_DATA.cueId,
      ownedCues: [...DEFAULT_OWNED_CUES],
    };
  }

  function _load(): PlayerData {
    if (cache) return copyMainData(cache);
    const raw = storage.getItem(PLAYER_DATA_LS_KEY);
    if (raw) {
      try {
        const j = JSON.parse(raw) as Partial<PlayerDataJSON>;
        cache = fromPlayerDataJSON(j);
        return copyMainData(cache);
      } catch {
        // fall through to migrate / default
      }
    }
    const migrated = _migrateLegacy();
    if (migrated) {
      cache = migrated;
      storage.setItem(PLAYER_DATA_LS_KEY, JSON.stringify(toPlayerDataJSON(migrated)));
      return copyMainData(cache);
    }
    cache = { ...DEFAULT_PLAYER_DATA, ownedCues: [...DEFAULT_OWNED_CUES] };
    return copyMainData(cache);
  }

  function _emit(data: PlayerData): void {
    for (const fn of listeners) fn(copyMainData(data));
  }

  return {
    getPlayerData(): PlayerData {
      return _load();
    },

    savePlayerData(data: PlayerData): void {
      cache = copyMainData(data);
      storage.setItem(PLAYER_DATA_LS_KEY, JSON.stringify(toPlayerDataJSON(cache)));
      // Keep legacy keys in sync so old readers still work during transition
      storage.setItem(LEGACY_NAME, cache.name);
      storage.setItem(LEGACY_AVATAR, cache.avatar);
      storage.setItem(LEGACY_CUE, cache.cueId);
      _emit(cache);
    },

    deletePlayerData(): void {
      cache = null;
      storage.removeItem(PLAYER_DATA_LS_KEY);
      storage.removeItem(LEGACY_NAME);
      storage.removeItem(LEGACY_AVATAR);
      storage.removeItem(LEGACY_CUE);
      _emit({ ...DEFAULT_PLAYER_DATA, ownedCues: [...DEFAULT_OWNED_CUES] });
    },

    subscribe(fn): () => void {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

/** Process-wide default manager (main.ts + UI). Tests pass their own storage. */
let _defaultMgr: PlayerDataManager | null = null;

export function getDefaultPlayerDataManager(): PlayerDataManager {
  if (!_defaultMgr) _defaultMgr = createPlayerDataManager();
  return _defaultMgr;
}

/** Test-only: reset singleton. */
export function _resetDefaultPlayerDataManagerForTests(): void {
  _defaultMgr = null;
}
