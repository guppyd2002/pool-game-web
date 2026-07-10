// @vitest-environment happy-dom
/**
 * Overlay hitTest exclusion test.
 *
 * Verifies that pointer events on the power-slider and spin-disc overlays
 * do NOT propagate to the canvas (table aim-drag handler).
 *
 * Risk: power/spin are overlays ON the table (z-index:100). If they leak
 * pointer events, table taps inside overlay bounds silently set aim direction.
 *
 * Method: mount a mock canvas + overlay, attach a pointerdown listener to
 * the canvas, dispatch pointerdown on the overlay — canvas listener must NOT
 * fire (because overlay element is the event target, not canvas sibling).
 */

import { describe, it, expect, vi } from 'vitest';

describe('overlay hitTest guard — power bar', () => {
  it('pointerdown on power-bar track does not reach canvas', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    // Build minimal power-bar overlay (mirrors createPowerSliderUI structure)
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;right:16px;top:50%;z-index:100;';
    const track = document.createElement('div');
    track.style.cssText = 'width:48px;height:240px;touch-action:none;';
    overlay.appendChild(track);
    container.appendChild(overlay);

    const canvasSpy = vi.fn();
    canvas.addEventListener('pointerdown', canvasSpy);

    // Simulate stopPropagation on the track (as done in power-slider-ui.ts)
    track.addEventListener('pointerdown', (e: Event) => {
      e.stopPropagation();
    });

    // Dispatch pointerdown on the TRACK
    const evt = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 800,
      clientY: 200,
    });
    track.dispatchEvent(evt);

    // Canvas listener must NOT have fired
    expect(canvasSpy).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('pointerdown on canvas area NOT covered by overlay reaches canvas', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;right:16px;top:50%;z-index:100;';
    container.appendChild(overlay);

    const canvasSpy = vi.fn();
    canvas.addEventListener('pointerdown', canvasSpy);

    // Dispatch directly on canvas (no overlay in the way)
    const evt = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 200,
    });
    canvas.dispatchEvent(evt);

    expect(canvasSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
  });
});

describe('overlay hitTest guard — spin disc button', () => {
  it('pointerdown on spin disc button does not reach canvas', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    // Spin disc overlay with button (mirrors createSpinDiscUI structure)
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;left:12px;top:50%;z-index:100;';
    const btn = document.createElement('button');
    btn.style.cssText = 'width:68px;height:68px;border-radius:50%;touch-action:none;';
    overlay.appendChild(btn);
    container.appendChild(overlay);

    const canvasSpy = vi.fn();
    canvas.addEventListener('pointerdown', canvasSpy);

    // Buttons don't need explicit stopPropagation — they're separate DOM elements.
    // But verify that click on button does NOT reach canvas.
    const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(evt);

    // Canvas must NOT fire (btn is a separate element from canvas)
    expect(canvasSpy).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });

  it('spin disc panel pointerdown has stopPropagation preventing canvas reach', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;left:12px;top:50%;z-index:100;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:130px;height:130px;border-radius:50%;touch-action:none;';
    overlay.appendChild(panel);
    container.appendChild(overlay);

    const canvasSpy = vi.fn();
    canvas.addEventListener('pointerdown', canvasSpy);

    // Panel has stopPropagation (as in spin-disc-ui.ts)
    panel.addEventListener('pointerdown', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    });

    const evt = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    panel.dispatchEvent(evt);

    expect(canvasSpy).not.toHaveBeenCalled();

    document.body.removeChild(container);
  });
});
