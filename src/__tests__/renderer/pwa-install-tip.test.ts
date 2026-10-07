/**
 * Phase 1 / 0-G — PWA install tip + standalone detection.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPwaInstallTip, isStandaloneDisplay } from '../../renderer/pwa-install-tip';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1 0-G PWA', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.getElementById('pwa-install-tip')?.remove();
    localStorage.clear();
  });

  it('manifest.webmanifest is valid JSON with standalone display', () => {
    const raw = readFileSync(resolve(__dirname, '../../../public/manifest.webmanifest'), 'utf8');
    const m = JSON.parse(raw) as {
      display: string;
      icons: { src: string; sizes: string }[];
      orientation?: string;
    };
    expect(m.display).toBe('standalone');
    // D-1 已定直屏但 orientation 仍須不設（§F.3 自適應；設 portrait＝manifest 版 B-11）
    expect(m.orientation).toBeUndefined();
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });

  it('isStandaloneDisplay reads display-mode media', () => {
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => {
      return {
        matches: q.includes('display-mode: standalone'),
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    });
    expect(isStandaloneDisplay()).toBe(true);
    spy.mockRestore();
  });

  it('createPwaInstallTip mounts on coarse pointer and dismisses to localStorage', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => {
      const matches =
        q.includes('pointer: coarse') || q.includes('max-width')
          ? true
          : q.includes('display-mode: standalone')
            ? false
            : false;
      return {
        matches,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    });

    const root = document.createElement('div');
    document.body.appendChild(root);
    const tipApi = createPwaInstallTip(root);
    const el = root.querySelector('#pwa-install-tip') as HTMLElement;
    expect(el).toBeTruthy();
    const btn = el.querySelector('button')!;
    btn.click();
    expect(root.querySelector('#pwa-install-tip')).toBeNull();
    expect(localStorage.getItem('hp.pwaInstallTip.dismissed')).toBe('1');
    tipApi.dispose();
    root.remove();
  });
});
