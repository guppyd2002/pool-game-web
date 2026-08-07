/**
 * UI-007 settings load/save (P1-T07).
 * Vitest node env has no localStorage — use a minimal memory stub.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings } from '../../renderer/settings-panel';

const store = new Map<string, string>();
const lsStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: () => null,
  get length() { return store.size; },
};

describe('settings-panel localStorage', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true });
  });

  it('defaults: music/sfx on, autoCue off', () => {
    const s = loadSettings();
    expect(s.music).toBe(true);
    expect(s.sfx).toBe(true);
    expect(s.autoCue).toBe(false);
  });

  it('roundtrips save → load', () => {
    saveSettings({ music: false, sfx: true, autoCue: true });
    const s = loadSettings();
    expect(s.music).toBe(false);
    expect(s.sfx).toBe(true);
    expect(s.autoCue).toBe(true);
  });
});
