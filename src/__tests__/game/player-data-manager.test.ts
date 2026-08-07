/**
 * P1-T09 PlayerDataManager boundary / edge tests (DATA-004).
 * Complements player-data.test.ts happy-path with missing/corrupt storage cases.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPlayerDataManager,
  getDefaultPlayerDataManager,
  _resetDefaultPlayerDataManagerForTests,
  PLAYER_DATA_LS_KEY,
  type StorageLike,
} from '../../game/player-data-manager';
import { DEFAULT_PLAYER_DATA, DEFAULT_OWNED_CUES } from '../../game/player-data';

function memStorage(): StorageLike & { _m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

describe('PlayerDataManager edges (T09 / DATA-004)', () => {
  let storage: ReturnType<typeof memStorage>;

  beforeEach(() => {
    storage = memStorage();
    localStorage.clear();
    _resetDefaultPlayerDataManagerForTests();
  });

  afterEach(() => {
    localStorage.clear();
    _resetDefaultPlayerDataManagerForTests();
  });

  it('empty storage → defaults (missing data)', () => {
    const mgr = createPlayerDataManager(storage);
    const p = mgr.getPlayerData();
    expect(p.name).toBe(DEFAULT_PLAYER_DATA.name);
    expect(p.coins).toBe(DEFAULT_PLAYER_DATA.coins);
    expect(p.ownedCues).toEqual([...DEFAULT_OWNED_CUES]);
  });

  it('corrupt JSON falls back to defaults (format error)', () => {
    storage.setItem(PLAYER_DATA_LS_KEY, '{not-json!!!');
    const mgr = createPlayerDataManager(storage);
    const p = mgr.getPlayerData();
    expect(p.name).toBe(DEFAULT_PLAYER_DATA.name);
    expect(p.coins).toBe(1000);
  });

  it('wrong schema version (v≠1) yields defaults via fromPlayerDataJSON', () => {
    storage.setItem(PLAYER_DATA_LS_KEY, JSON.stringify({ v: 99, n: 'Hacker', c: 999 }));
    const mgr = createPlayerDataManager(storage);
    const p = mgr.getPlayerData();
    // fromPlayerDataJSON rejects non-v1
    expect(p.name).toBe(DEFAULT_PLAYER_DATA.name);
    expect(p.coins).toBe(DEFAULT_PLAYER_DATA.coins);
  });

  it('partial valid v1 fills missing fields with defaults', () => {
    storage.setItem(PLAYER_DATA_LS_KEY, JSON.stringify({ v: 1, n: 'OnlyName' }));
    const mgr = createPlayerDataManager(storage);
    const p = mgr.getPlayerData();
    expect(p.name).toBe('OnlyName');
    expect(p.avatar).toBe('🎱');
    expect(p.coins).toBe(1000);
    expect(p.ownedCues.length).toBeGreaterThan(0);
  });

  it('legacy migrate ignores unowned cue id → default cue', () => {
    storage.setItem('pool.profile.name', '  Bob  ');
    storage.setItem('pool.profile.avatar', '🦁');
    storage.setItem('pool.cue.equipped', 'not-owned-legendary');
    const mgr = createPlayerDataManager(storage);
    const p = mgr.getPlayerData();
    expect(p.name).toBe('Bob');
    expect(p.avatar).toBe('🦁');
    expect(p.cueId).toBe(DEFAULT_PLAYER_DATA.cueId);
    // Migration writes unified key
    expect(storage.getItem(PLAYER_DATA_LS_KEY)).toBeTruthy();
  });

  it('legacy empty name falls back to default name', () => {
    storage.setItem('pool.profile.name', '   ');
    storage.setItem('pool.profile.avatar', '🦄');
    const mgr = createPlayerDataManager(storage);
    expect(mgr.getPlayerData().name).toBe(DEFAULT_PLAYER_DATA.name);
  });

  it('getPlayerData returns defensive copy (mutation does not poison cache)', () => {
    const mgr = createPlayerDataManager(storage);
    mgr.savePlayerData({ ...DEFAULT_PLAYER_DATA, name: 'Safe', ownedCues: [...DEFAULT_OWNED_CUES] });
    const a = mgr.getPlayerData();
    a.name = 'Mutated';
    a.ownedCues.push('hack');
    const b = mgr.getPlayerData();
    expect(b.name).toBe('Safe');
    expect(b.ownedCues).not.toContain('hack');
  });

  it('subscribe unsubscribe stops further notifications', () => {
    const mgr = createPlayerDataManager(storage);
    const seen: string[] = [];
    const unsub = mgr.subscribe((d) => seen.push(d.name));
    mgr.savePlayerData({ ...DEFAULT_PLAYER_DATA, name: 'A' });
    unsub();
    mgr.savePlayerData({ ...DEFAULT_PLAYER_DATA, name: 'B' });
    expect(seen).toEqual(['A']);
  });

  it('deletePlayerData emits defaults to subscribers', () => {
    const mgr = createPlayerDataManager(storage);
    mgr.savePlayerData({ ...DEFAULT_PLAYER_DATA, name: 'X', coins: 50 });
    let lastCoins = -1;
    mgr.subscribe((d) => { lastCoins = d.coins; });
    mgr.deletePlayerData();
    expect(lastCoins).toBe(DEFAULT_PLAYER_DATA.coins);
    expect(storage.getItem(PLAYER_DATA_LS_KEY)).toBeNull();
  });

  it('getDefaultPlayerDataManager is a process singleton until reset', () => {
    const a = getDefaultPlayerDataManager();
    const b = getDefaultPlayerDataManager();
    expect(a).toBe(b);
    _resetDefaultPlayerDataManagerForTests();
    const c = getDefaultPlayerDataManager();
    expect(c).not.toBe(a);
  });
});
