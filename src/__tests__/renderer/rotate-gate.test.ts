/**
 * B-11 / challenge #046 — rotate-gate pure helpers + single-source contract.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  computeShouldShowRotatePrompt,
  readRotateGateFlags,
  flagsExpired,
  ROTATE_GATE_DEFAULT_MAX_WIDTH,
  ROTATE_GATE_LEGACY_MAX_WIDTH,
  ROTATE_GATE_FLAG_SUNSET_ISO,
} from '../../renderer/rotate-gate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('computeShouldShowRotatePrompt (#046 formula)', () => {
  const coarse = { pointerCoarse: true, hoverNone: false };
  const fine = { pointerCoarse: false, hoverNone: false };
  const hoverNoneOnly = { pointerCoarse: false, hoverNone: true };

  it('iPhone portrait + coarse → ON', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 390, height: 844, ...coarse }),
    ).toBe(true);
  });

  it('iPhone landscape → OFF', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 844, height: 390, ...coarse }),
    ).toBe(false);
  });

  it('iPad 1024×1366 portrait + coarse → ON (B-11 fix)', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 1024, height: 1366, ...coarse }),
    ).toBe(true);
  });

  it('iPad landscape → OFF', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 1366, height: 1024, ...coarse }),
    ).toBe(false);
  });

  it('desktop 900×1200 portrait + fine → OFF (挑戰 1)', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 900, height: 1200, ...fine }),
    ).toBe(false);
  });

  it('hover:none alone can ON in portrait within max', () => {
    expect(
      computeShouldShowRotatePrompt({ width: 768, height: 1024, ...hoverNoneOnly }),
    ).toBe(true);
  });

  it('width > default max → OFF even if coarse', () => {
    expect(
      computeShouldShowRotatePrompt({
        width: ROTATE_GATE_DEFAULT_MAX_WIDTH + 1,
        height: 2000,
        ...coarse,
      }),
    ).toBe(false);
  });

  it('legacy: portrait && w<=900 only (no coarse)', () => {
    expect(
      computeShouldShowRotatePrompt({
        width: 390,
        height: 844,
        ...fine,
        legacy: true,
      }),
    ).toBe(true);
    expect(
      computeShouldShowRotatePrompt({
        width: 1024,
        height: 1366,
        ...coarse,
        legacy: true,
      }),
    ).toBe(false);
  });

  it('flag maxWidth=900 keeps coarse requirement unless legacy', () => {
    expect(
      computeShouldShowRotatePrompt({
        width: 800,
        height: 1200,
        ...fine,
        maxWidth: 900,
      }),
    ).toBe(false);
    expect(
      computeShouldShowRotatePrompt({
        width: 800,
        height: 1200,
        ...coarse,
        maxWidth: 900,
      }),
    ).toBe(true);
  });
});

describe('readRotateGateFlags', () => {
  const mem = (map: Record<string, string>) => ({
    getItem: (k: string) => (k in map ? map[k] : null),
  });

  it('defaults to 1366 / non-legacy', () => {
    const f = readRotateGateFlags('', mem({}), new Date('2026-10-06'));
    expect(f.maxWidth).toBe(ROTATE_GATE_DEFAULT_MAX_WIDTH);
    expect(f.legacy).toBe(false);
    expect(f.flagsExpired).toBe(false);
  });

  it('URL rotateGateMax overrides', () => {
    const f = readRotateGateFlags('?rotateGateMax=900', mem({}), new Date('2026-10-06'));
    expect(f.maxWidth).toBe(900);
  });

  it('URL rotateGateLegacy=1', () => {
    const f = readRotateGateFlags('?rotateGateLegacy=1', mem({}), new Date('2026-10-06'));
    expect(f.legacy).toBe(true);
    expect(f.maxWidth).toBe(ROTATE_GATE_DEFAULT_MAX_WIDTH);
  });

  it('after sunset ignores flags', () => {
    const f = readRotateGateFlags(
      '?rotateGateLegacy=1&rotateGateMax=900',
      mem({}),
      new Date('2026-11-05'),
    );
    expect(f.flagsExpired).toBe(true);
    expect(f.legacy).toBe(false);
    expect(f.maxWidth).toBe(ROTATE_GATE_DEFAULT_MAX_WIDTH);
  });

  it('sunset helper + literal width pins (non-self-referential)', () => {
    expect(flagsExpired(new Date('2026-11-04'))).toBe(false);
    expect(flagsExpired(new Date('2026-11-05'))).toBe(true);
    expect(ROTATE_GATE_FLAG_SUNSET_ISO).toBe('2026-11-05');
    expect(ROTATE_GATE_LEGACY_MAX_WIDTH).toBe(900);
    expect(ROTATE_GATE_DEFAULT_MAX_WIDTH).toBe(1366);
  });
});

describe('single-source / anti-drift contracts', () => {
  it('index.html: FOUC belt only under :not(.rotate-gate-resolved); steady = JS class', () => {
    const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    expect(html).toMatch(/html\.rotate-gate-active\s+#rotate-prompt/);
    // FOUC insurance (must match JS formula; scoped so JS handoff ends dual-truth window)
    expect(html).toMatch(
      /html:not\(\.rotate-gate-resolved\)\s+#rotate-prompt/,
    );
    expect(html).toContain('max-width: 1366px');
    expect(html).toContain('(pointer: coarse)');
    expect(html).toContain('(hover: none)');
    // Forbid the old dual-truth media (900, no pointer)
    expect(html).not.toContain(
      '@media screen and (orientation: portrait) and (max-width: 900px)',
    );
    expect(html).not.toMatch(/any-pointer:\s*coarse/);
  });

  it('rotate-gate.ts must not use any-pointer:coarse', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'src/renderer/rotate-gate.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/any-pointer\s*:\s*coarse/);
  });
});
