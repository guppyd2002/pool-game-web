/**
 * POPUP-001 popup manager unit tests (P1-T08).
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPopupManager } from '../../renderer/popup-manager';

describe('createPopupManager', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('open/close toggles registration and stack', () => {
    const mgr = createPopupManager(root);
    let shown = false;
    mgr.register('settings', {
      show: () => { shown = true; },
      hide: () => { shown = false; },
    });
    expect(mgr.isOpen('settings')).toBe(false);
    mgr.open('settings');
    expect(shown).toBe(true);
    expect(mgr.isOpen('settings')).toBe(true);
    expect(mgr.stack()).toEqual(['settings']);
    mgr.close('settings');
    expect(shown).toBe(false);
    expect(mgr.stack()).toEqual([]);
    mgr.dispose();
  });

  it('closeAll hides every open panel', () => {
    const mgr = createPopupManager(root);
    const flags = { settings: false, profile: false };
    mgr.register('settings', {
      show: () => { flags.settings = true; },
      hide: () => { flags.settings = false; },
    });
    mgr.register('profile', {
      show: () => { flags.profile = true; },
      hide: () => { flags.profile = false; },
    });
    mgr.open('settings');
    mgr.open('profile');
    expect(mgr.stack()).toEqual(['settings', 'profile']);
    mgr.closeAll();
    expect(flags.settings).toBe(false);
    expect(flags.profile).toBe(false);
    expect(mgr.stack()).toEqual([]);
    mgr.dispose();
  });

  it('close() without id closes top of stack', () => {
    const mgr = createPopupManager(root);
    mgr.register('settings', { show: () => {}, hide: () => {} });
    mgr.register('cues', { show: () => {}, hide: () => {} });
    mgr.open('settings');
    mgr.open('cues');
    mgr.close();
    expect(mgr.stack()).toEqual(['settings']);
    mgr.dispose();
  });
});
