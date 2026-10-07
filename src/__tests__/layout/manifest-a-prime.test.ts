/**
 * Phase 1 A′ (decision 83046f66) — probe-only PWA manifest.
 * Game page must not invite standalone; layout-probe.html owns the manifest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

describe('Phase 1 A′ probe-only PWA', () => {
  it('manifest start_url/scope → layout-probe; no orientation; description neutral', () => {
    const raw = readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8');
    const m = JSON.parse(raw) as {
      description: string;
      start_url: string;
      scope: string;
      display: string;
      orientation?: string;
      icons: { sizes: string }[];
    };
    expect(m.display).toBe('standalone');
    expect(m.description).toBe('8-ball pool web game');
    expect(m.start_url).toBe('/layout-probe.html');
    expect(m.scope).toBe('/layout-probe.html');
    // §F.3 adaptive — do not set portrait (would be manifest-era B-11).
    expect(m.orientation).toBeUndefined();
    expect(m.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
  });

  it('index.html has no manifest link and no apple-mobile meta', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/rel=["']manifest["']/i);
    expect(html).not.toMatch(/apple-mobile-web-app/i);
    expect(html).not.toMatch(/apple-touch-icon/i);
    expect(html).not.toMatch(/mobile-web-app-capable/i);
  });

  it('layout-probe.html keeps manifest + apple meta for A2HS instrument', () => {
    const html = readFileSync(resolve(root, 'layout-probe.html'), 'utf8');
    expect(html).toMatch(/rel=["']manifest["']/i);
    expect(html).toMatch(/apple-mobile-web-app-capable/i);
    expect(html).toMatch(/apple-touch-icon/i);
  });
});
