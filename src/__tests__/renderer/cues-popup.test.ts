/**
 * POPUP-009 cue catalogue + equip persistence (P1-T08).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CUE_CATALOGUE,
  loadEquippedCueId,
  saveEquippedCueId,
  getEquippedCue,
} from '../../renderer/cues-popup';

const store = new Map<string, string>();
const lsStub = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: () => null,
  get length() { return store.size; },
};

describe('cues catalogue / equip', () => {
  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: lsStub, configurable: true });
  });

  it('catalogue has free starters and one locked', () => {
    expect(CUE_CATALOGUE.length).toBeGreaterThanOrEqual(3);
    expect(CUE_CATALOGUE.filter((c) => c.owned).length).toBeGreaterThanOrEqual(2);
    expect(CUE_CATALOGUE.some((c) => !c.owned)).toBe(true);
  });

  it('default equip is standard', () => {
    expect(loadEquippedCueId()).toBe('standard');
    expect(getEquippedCue().id).toBe('standard');
  });

  it('saveEquippedCueId roundtrips', () => {
    saveEquippedCueId('sniper');
    expect(loadEquippedCueId()).toBe('sniper');
    expect(getEquippedCue().name).toBe('Sniper');
  });

  it('falls back if equipped id is locked/unknown', () => {
    saveEquippedCueId('legend'); // not owned
    expect(loadEquippedCueId()).toBe('standard');
  });
});
