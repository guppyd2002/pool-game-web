/**
 * UI-007 / P1-T11 settings load/save + SET-001~003 helpers.
 * Vitest node env has no localStorage — use a minimal memory stub.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadSettings,
  saveSettings,
  subscribeSettings,
  isSfxOn,
  isMusicOn,
  isAutoCueOn,
  isSettingsUiDeferred,
  SETTINGS_UI_DEFERRED_KEYS,
} from '../../renderer/settings-panel';

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

describe('settings-panel SET-001~003 live helpers + subscribe', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true });
  });

  it('isSfxOn / isMusicOn / isAutoCueOn mirror storage', () => {
    expect(isSfxOn()).toBe(true);
    expect(isMusicOn()).toBe(true);
    expect(isAutoCueOn()).toBe(false);
    saveSettings({ music: false, sfx: false, autoCue: true });
    expect(isSfxOn()).toBe(false);
    expect(isMusicOn()).toBe(false);
    expect(isAutoCueOn()).toBe(true);
  });

  it('subscribeSettings fires on saveSettings (OnAudio/OnMusic/OnCueIsAuto)', () => {
    const spy = vi.fn();
    const unsub = subscribeSettings(spy);
    saveSettings({ music: true, sfx: false, autoCue: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ music: true, sfx: false, autoCue: false });
    unsub();
    saveSettings({ music: false, sfx: false, autoCue: false });
    expect(spy).toHaveBeenCalledTimes(1); // unsubscribed
  });
});

describe('settings UI honesty (Phase 1 close-out — no fake toggles)', () => {
  it('music and autoCue are UI-deferred; sfx is not', () => {
    expect(SETTINGS_UI_DEFERRED_KEYS).toContain('music');
    expect(SETTINGS_UI_DEFERRED_KEYS).toContain('autoCue');
    expect(isSettingsUiDeferred('music')).toBe(true);
    expect(isSettingsUiDeferred('autoCue')).toBe(true);
    expect(isSettingsUiDeferred('sfx')).toBe(false);
  });
});
