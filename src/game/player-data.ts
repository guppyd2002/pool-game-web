/**
 * P1-T09 — Player data model (DATA-006 / DATA-007 / DATA-010).
 * C# PlayerData.cs subset for web HotSeat: identity, coins, cues.
 * No PlayFab (DATA-005/011 DROPPED). Daily bonus DEFERRED P3.
 */

/** Compact JSON schema for localStorage (DATA-004 / DATA-010). */
export interface PlayerDataJSON {
  readonly v: 1;
  /** Display name */
  n: string;
  /** Avatar emoji or id */
  a: string;
  /** Soft currency coins */
  c: number;
  /** Equipped cue id */
  q: string;
  /** Owned cue ids */
  o: string[];
}

export interface PlayerData {
  name: string;
  avatar: string;
  coins: number;
  cueId: string;
  ownedCues: string[];
}

export const DEFAULT_OWNED_CUES = ['standard', 'pro', 'sniper'] as const;
export const DEFAULT_PLAYER_DATA: PlayerData = {
  name: 'Player 1',
  avatar: '🎱',
  coins: 1000,
  cueId: 'standard',
  ownedCues: [...DEFAULT_OWNED_CUES],
};

/** DATA-010: model → compact JSON */
export function toPlayerDataJSON(p: PlayerData): PlayerDataJSON {
  return {
    v: 1,
    n: p.name.slice(0, 24),
    a: p.avatar,
    c: Math.max(0, Math.min(1_000_000_000, Math.trunc(p.coins))),
    q: p.cueId,
    o: [...p.ownedCues],
  };
}

/** DATA-010: compact JSON → model (tolerant of missing fields) */
export function fromPlayerDataJSON(j: Partial<PlayerDataJSON> | null | undefined): PlayerData {
  if (!j || j.v !== 1) return { ...DEFAULT_PLAYER_DATA, ownedCues: [...DEFAULT_OWNED_CUES] };
  const owned = Array.isArray(j.o) && j.o.length > 0
    ? j.o.map(String)
    : [...DEFAULT_OWNED_CUES];
  let cueId = typeof j.q === 'string' ? j.q : 'standard';
  if (!owned.includes(cueId)) cueId = owned[0] ?? 'standard';
  return {
    name: (typeof j.n === 'string' && j.n.trim() ? j.n.trim() : 'Player 1').slice(0, 24),
    avatar: typeof j.a === 'string' && j.a ? j.a : '🎱',
    coins: typeof j.c === 'number' && Number.isFinite(j.c) ? Math.max(0, Math.trunc(j.c)) : 1000,
    cueId,
    ownedCues: owned,
  };
}

/** DATA-010: main-field equality (sync conflict detection stub for P2) */
export function isSameMainData(a: PlayerData, b: PlayerData): boolean {
  if (a.name !== b.name || a.avatar !== b.avatar || a.coins !== b.coins || a.cueId !== b.cueId) {
    return false;
  }
  if (a.ownedCues.length !== b.ownedCues.length) return false;
  const sa = [...a.ownedCues].sort().join(',');
  const sb = [...b.ownedCues].sort().join(',');
  return sa === sb;
}

/** Copy core fields (C# CopyMainData). */
export function copyMainData(from: PlayerData): PlayerData {
  return {
    name: from.name,
    avatar: from.avatar,
    coins: from.coins,
    cueId: from.cueId,
    ownedCues: [...from.ownedCues],
  };
}

export function addCoins(p: PlayerData, delta: number): PlayerData {
  return { ...p, coins: Math.max(0, Math.min(1_000_000_000, p.coins + Math.trunc(delta))) };
}

/** DATA-007: own + equip (purchase path for free unlocks; IAP P3). */
export function addAndSetCue(p: PlayerData, cueId: string): PlayerData {
  const owned = p.ownedCues.includes(cueId) ? p.ownedCues : [...p.ownedCues, cueId];
  return { ...p, ownedCues: owned, cueId };
}

export function setEquippedCue(p: PlayerData, cueId: string): PlayerData | null {
  if (!p.ownedCues.includes(cueId)) return null;
  return { ...p, cueId };
}
