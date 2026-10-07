/**
 * Phase 1 F-2b-5 — power/spin children size from gutter; wrappers are not clamps.
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { createPowerSliderUI } from '../../renderer/power-slider-ui';
import { createSpinDiscUI } from '../../renderer/spin-disc-ui';
import { createShotSlider } from '../../game/shot-slider';
import { createSpinDisc } from '../../game/spin-disc';
import {
  GUTTER_INNER_PAD_PX,
  POWER_TRACK_W_NATURAL,
  SPIN_BTN_NATURAL,
  SPIN_DISC_RADIUS_NATURAL,
} from '../../layout/gutter-control-size';

function makeContainer(gutterLeft = 120, gutterRight = 120): HTMLElement {
  const el = document.createElement('div');
  el.style.setProperty('--gutter-left', `${gutterLeft}px`);
  el.style.setProperty('--gutter-right', `${gutterRight}px`);
  document.body.appendChild(el);
  return el;
}

describe('F-2b-5 gutter-driven side controls', () => {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    while (disposers.length) disposers.pop()!();
  });

  it('power track width comes from gutter; overlay has no max-width / overflow clamp', () => {
    const container = makeContainer(120, 46);
    const ui = createPowerSliderUI(container, createShotSlider({ isAutoShot: false }));
    disposers.push(() => { ui.dispose(); container.remove(); });

    const overlay = ui.element;
    expect(overlay.style.maxWidth).toBe('');
    expect(overlay.style.overflow).toBe('');

    const track = Array.from(overlay.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.style.cursor === 'ns-resize',
    )!;
    // usable = 46 − pad(4) = 42
    expect(parseFloat(track.style.width)).toBe(46 - GUTTER_INNER_PAD_PX);
    expect(parseFloat(track.style.width)).toBeLessThan(POWER_TRACK_W_NATURAL);
  });

  it('power track keeps natural width when gutter is ample', () => {
    const container = makeContainer(120, 200);
    const ui = createPowerSliderUI(container, createShotSlider({ isAutoShot: false }));
    disposers.push(() => { ui.dispose(); container.remove(); });

    const track = Array.from(ui.element.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.style.cursor === 'ns-resize',
    )!;
    expect(parseFloat(track.style.width)).toBe(POWER_TRACK_W_NATURAL);
  });

  it('spin disc/btn size from gutter; overlay has no max-width / overflow clamp', () => {
    const container = makeContainer(48, 120);
    const ui = createSpinDiscUI(container, createSpinDisc({}));
    disposers.push(() => { ui.dispose(); container.remove(); });

    const overlay = ui.element;
    expect(overlay.style.maxWidth).toBe('');
    expect(overlay.style.overflow).toBe('');

    const btn = overlay.querySelector('button')!;
    // usable = 48 − pad(4) = 44
    expect(parseFloat(btn.style.width)).toBe(48 - GUTTER_INNER_PAD_PX);
    expect(parseFloat(btn.style.width)).toBeLessThan(SPIN_BTN_NATURAL);

    const panel = Array.from(overlay.querySelectorAll<HTMLElement>('div')).find(
      (el) => el.style.borderRadius === '50%' && el.style.position === 'relative',
    )!;
    expect(parseFloat(panel.style.width)).toBe(48 - GUTTER_INNER_PAD_PX);
    expect(parseFloat(panel.style.width)).toBeLessThan(SPIN_DISC_RADIUS_NATURAL * 2);
  });

  it('index.html left-hand CSS no longer clamps overlays with max-width', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
    const leftHandBlock = html.match(
      /#app\.left-hand-mode[\s\S]*?(?=\/\*|@media|$)/,
    )?.[0] ?? '';
    expect(leftHandBlock).toContain('power-slider-overlay');
    expect(leftHandBlock).toContain('spin-disc-overlay');
    expect(leftHandBlock).not.toMatch(/max-width\s*:/);
  });
});
