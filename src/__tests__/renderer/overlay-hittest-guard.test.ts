// @vitest-environment happy-dom
/**
 * Overlay hitTest guard — real component tests.
 *
 * 卡卡西 MUST-FIX 指示（re-QA）：
 *   - Import 真實 component（createPowerSliderUI / createSpinDiscUI）
 *   - spy 掛 container（共同祖先），不是 sibling canvas
 *   - 反向測試：移除 stopPropagation → spy 應觸發（有牙的測試）
 *
 * 架構保證：overlay 是 canvas sibling，所以 canvas 的 listeners 天然不會
 * 收到 overlay 的事件。但這不足以鎖定「當 aim listener 從 canvas 移至 container」
 * 的回歸情境。以 container spy 才能真正考驗 stopPropagation。
 */

import { describe, it, expect, vi } from 'vitest';
import { createPowerSliderUI } from '../../renderer/power-slider-ui';
import { createSpinDiscUI } from '../../renderer/spin-disc-ui';
import { createShotSlider } from '../../game/shot-slider';
import { createSpinDisc } from '../../game/spin-disc';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanup(container: HTMLElement): void {
  document.body.removeChild(container);
}

function dispatchPointerDown(target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    pointerId: 1,
    isPrimary: true,
  }));
}

/** Find the power bar track (cursor: ns-resize). */
function findPowerTrack(container: HTMLElement): HTMLElement {
  const track = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
    el => el.style.cursor === 'ns-resize',
  );
  if (!track) throw new Error('power bar track not found');
  return track;
}

/** Find the spin disc panel (border-radius: 50%, position: relative). */
function findSpinPanel(container: HTMLElement): HTMLElement {
  const panel = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
    el => el.style.borderRadius === '50%' && el.style.position === 'relative',
  );
  if (!panel) throw new Error('spin disc panel not found');
  return panel;
}

// ─── Power Bar — stopPropagation prevents container spy ────────────────────────

describe('power bar overlay — container spy (real component)', () => {
  it('pointerdown on power track does NOT reach container (stopPropagation in effect)', () => {
    const container = makeContainer();
    const slider = createShotSlider({ isAutoShot: false });
    createPowerSliderUI(container, slider);

    const spy = vi.fn();
    container.addEventListener('pointerdown', spy);

    const track = findPowerTrack(container);
    dispatchPointerDown(track);

    expect(spy).not.toHaveBeenCalled();

    container.removeEventListener('pointerdown', spy);
    cleanup(container);
  });

  it('FANG: without stopPropagation on track, container spy IS called — proving test has teeth', () => {
    const container = makeContainer();
    const slider = createShotSlider({ isAutoShot: false });
    createPowerSliderUI(container, slider);

    const track = findPowerTrack(container);

    // Temporarily bypass stopPropagation by adding a listener that re-dispatches without it
    // Simpler: dispatch a plain bubbling event that has no stopPropagation in its capture phase
    // — we intercept by replacing the track listener via a one-shot capture listener.
    const spy = vi.fn();
    container.addEventListener('pointerdown', spy);

    // Dispatch using capture=true skip on track: attach capture listener that DOES propagate
    // The real test: if we dispatch without any stopPropagation, spy fires.
    const rawEvt = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      isPrimary: true,
    });
    // Override stopPropagation to be a no-op for this event
    rawEvt.stopPropagation = () => { /* no-op — simulates missing stopPropagation */ };

    track.dispatchEvent(rawEvt);

    // With stopPropagation neutralised, spy on container should fire
    expect(spy).toHaveBeenCalledTimes(1);

    container.removeEventListener('pointerdown', spy);
    cleanup(container);
  });
});

// ─── Spin Disc panel — stopPropagation prevents container spy ─────────────────

describe('spin disc overlay — container spy (real component)', () => {
  it('pointerdown on spin disc panel does NOT reach container (stopPropagation in effect)', () => {
    const container = makeContainer();
    const disc = createSpinDisc({});
    createSpinDiscUI(container, disc);

    // Open panel so it's in the DOM and not display:none
    disc.open();
    const panel = findSpinPanel(container);
    panel.style.display = 'block';

    const spy = vi.fn();
    container.addEventListener('pointerdown', spy);

    dispatchPointerDown(panel);

    expect(spy).not.toHaveBeenCalled();

    container.removeEventListener('pointerdown', spy);
    cleanup(container);
  });

  it('FANG: without stopPropagation on spin panel, container spy IS called', () => {
    const container = makeContainer();
    const disc = createSpinDisc({});
    createSpinDiscUI(container, disc);

    disc.open();
    const panel = findSpinPanel(container);
    panel.style.display = 'block';

    const spy = vi.fn();
    container.addEventListener('pointerdown', spy);

    // Neutralise stopPropagation — event should reach container
    const rawEvt = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      isPrimary: true,
    });
    rawEvt.stopPropagation = () => { /* no-op */ };

    panel.dispatchEvent(rawEvt);

    expect(spy).toHaveBeenCalledTimes(1);

    container.removeEventListener('pointerdown', spy);
    cleanup(container);
  });
});
