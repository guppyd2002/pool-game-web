/**
 * POPUP-002 player profile popup unit tests (P1-T08).
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPlayerProfilePopup,
  loadPlayerProfile,
  savePlayerProfile,
} from '../../renderer/player-profile-popup';
import {
  _resetDefaultPlayerDataManagerForTests,
  PLAYER_DATA_LS_KEY,
} from '../../game/player-data-manager';
import { DEFAULT_PLAYER_DATA } from '../../game/player-data';

describe('player-profile-popup (T08 / POPUP-002)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    localStorage.clear();
    _resetDefaultPlayerDataManagerForTests();
  });

  afterEach(() => {
    localStorage.clear();
    _resetDefaultPlayerDataManagerForTests();
    root.remove();
  });

  it('loadPlayerProfile returns defaults when storage empty', () => {
    const p = loadPlayerProfile();
    expect(p.name).toBe(DEFAULT_PLAYER_DATA.name);
    expect(p.avatar).toBe(DEFAULT_PLAYER_DATA.avatar);
  });

  it('savePlayerProfile persists via PlayerDataManager and truncates name to 24', () => {
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 26
    savePlayerProfile({ name: long, avatar: '🦊' });
    const p = loadPlayerProfile();
    expect(p.name.length).toBe(24);
    expect(p.name).toBe(long.slice(0, 24));
    expect(p.avatar).toBe('🦊');
    expect(localStorage.getItem(PLAYER_DATA_LS_KEY)).toBeTruthy();
  });

  it('show/hide toggles display; getProfile reads storage', () => {
    savePlayerProfile({ name: 'Ace', avatar: '🐼' });
    const popup = createPlayerProfilePopup(root);
    expect(popup.element.style.display).toBe('none');
    popup.show();
    expect(popup.element.style.display).toBe('flex');
    const input = popup.element.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Ace');
    expect(popup.getProfile().name).toBe('Ace');
    popup.hide();
    expect(popup.element.style.display).toBe('none');
    popup.dispose();
  });

  it('readOnly mode disables edit chrome and hides Save', () => {
    const popup = createPlayerProfilePopup(root);
    popup.show({ readOnly: true, name: 'Opp', avatar: '🐯' });
    const input = popup.element.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    const saveBtn = [...popup.element.querySelectorAll('button')].find((b) => b.textContent === 'Save') as HTMLButtonElement;
    expect(saveBtn.style.display).toBe('none');
    expect(popup.element.textContent).toContain('Opponent Profile');
    popup.dispose();
  });

  it('Save trims empty name to Player 1, fires onChange, hides', () => {
    const popup = createPlayerProfilePopup(root);
    const onChange = vi.fn();
    popup.onChange = onChange;
    popup.show();
    const input = popup.element.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    const saveBtn = [...popup.element.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
    saveBtn.click();
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].name).toBe('Player 1');
    expect(popup.element.style.display).toBe('none');
    expect(loadPlayerProfile().name).toBe('Player 1');
    popup.dispose();
  });

  it('Close hides without requiring save', () => {
    const popup = createPlayerProfilePopup(root);
    popup.show();
    const closeBtn = [...popup.element.querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    closeBtn.click();
    expect(popup.element.style.display).toBe('none');
    popup.dispose();
  });

  it('dispose removes element from DOM', () => {
    const popup = createPlayerProfilePopup(root);
    popup.dispose();
    expect(root.querySelector('#popup-profile')).toBeNull();
  });
});
