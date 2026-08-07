/**
 * P1-T09 player data model + manager (DATA-004/006/007/010).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  toPlayerDataJSON,
  fromPlayerDataJSON,
  isSameMainData,
  copyMainData,
  addCoins,
  addAndSetCue,
  setEquippedCue,
  DEFAULT_PLAYER_DATA,
} from '../../game/player-data';
import {
  createPlayerDataManager,
  PLAYER_DATA_LS_KEY,
} from '../../game/player-data-manager';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    _m: m,
  };
}

describe('PlayerData JSON (DATA-010)', () => {
  it('roundtrips toPlayerDataJSON → fromPlayerDataJSON', () => {
    const p = addCoins(DEFAULT_PLAYER_DATA, 500);
    const j = toPlayerDataJSON(p);
    const back = fromPlayerDataJSON(j);
    expect(back.name).toBe(p.name);
    expect(back.coins).toBe(1500);
    expect(back.cueId).toBe(p.cueId);
    expect(isSameMainData(p, back)).toBe(true);
  });

  it('fromPlayerDataJSON tolerates null → defaults', () => {
    const d = fromPlayerDataJSON(null);
    expect(d.coins).toBe(1000);
    expect(d.ownedCues.length).toBeGreaterThan(0);
  });

  it('copyMainData is deep for ownedCues', () => {
    const a = copyMainData(DEFAULT_PLAYER_DATA);
    a.ownedCues.push('hack');
    expect(DEFAULT_PLAYER_DATA.ownedCues).not.toContain('hack');
  });

  it('addAndSetCue owns + equips; setEquippedCue rejects unowned', () => {
    let p = addAndSetCue(DEFAULT_PLAYER_DATA, 'legend');
    expect(p.ownedCues).toContain('legend');
    expect(p.cueId).toBe('legend');
    expect(setEquippedCue(DEFAULT_PLAYER_DATA, 'legend')).toBeNull();
  });
});

describe('PlayerDataManager (DATA-004)', () => {
  let storage: ReturnType<typeof memStorage>;
  let mgr: ReturnType<typeof createPlayerDataManager>;

  beforeEach(() => {
    storage = memStorage();
    mgr = createPlayerDataManager(storage);
  });

  it('save → get restores coins/name/cue', () => {
    const p = addCoins({ ...DEFAULT_PLAYER_DATA, name: 'Ace', avatar: '🦊' }, 200);
    mgr.savePlayerData(p);
    const loaded = mgr.getPlayerData();
    expect(loaded.name).toBe('Ace');
    expect(loaded.avatar).toBe('🦊');
    expect(loaded.coins).toBe(1200);
    expect(storage.getItem(PLAYER_DATA_LS_KEY)).toBeTruthy();
  });

  it('deletePlayerData clears storage', () => {
    mgr.savePlayerData(DEFAULT_PLAYER_DATA);
    mgr.deletePlayerData();
    expect(storage.getItem(PLAYER_DATA_LS_KEY)).toBeNull();
    expect(mgr.getPlayerData().name).toBe(DEFAULT_PLAYER_DATA.name);
  });

  it('migrates legacy profile + cue keys', () => {
    storage.setItem('pool.profile.name', 'Legacy');
    storage.setItem('pool.profile.avatar', '🐼');
    storage.setItem('pool.cue.equipped', 'pro');
    const m2 = createPlayerDataManager(storage);
    const p = m2.getPlayerData();
    expect(p.name).toBe('Legacy');
    expect(p.avatar).toBe('🐼');
    expect(p.cueId).toBe('pro');
  });

  it('subscribe fires on save', () => {
    const seen: number[] = [];
    mgr.subscribe((d) => seen.push(d.coins));
    mgr.savePlayerData(addCoins(DEFAULT_PLAYER_DATA, 1));
    expect(seen[0]).toBe(1001);
  });
});
