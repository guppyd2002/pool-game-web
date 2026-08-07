/**
 * UI-018 point-fly unit tests (P1-T07).
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPointFlyUI } from '../../renderer/point-fly-ui';

describe('createPointFlyUI (T07 / UI-018)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it('mounts a non-interactive layer on the container', () => {
    const ui = createPointFlyUI(root);
    const layer = root.querySelector('#point-fly-layer') as HTMLElement;
    expect(layer).toBeTruthy();
    expect(layer.style.pointerEvents).toBe('none');
    expect(layer.parentElement).toBe(root);
    ui.dispose();
  });

  it('fly(0) inserts default "+1" label and animates toward P1 (left)', () => {
    const ui = createPointFlyUI(root);
    ui.fly(0);
    const layer = root.querySelector('#point-fly-layer')!;
    const label = layer.querySelector('div') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('+1');
    // After reflow, transform targets left HUD (negative vw)
    expect(label.style.transform).toContain('-42vw');
    expect(label.style.opacity).toBe('0');
    ui.dispose();
  });

  it('fly(1, custom) uses custom text and flies toward P2 (right)', () => {
    const ui = createPointFlyUI(root);
    ui.fly(1, '+3');
    const label = root.querySelector('#point-fly-layer div') as HTMLElement;
    expect(label.textContent).toBe('+3');
    expect(label.style.transform).toContain('42vw');
    ui.dispose();
  });

  it('removes label after animation timeout', () => {
    const ui = createPointFlyUI(root);
    ui.fly(0);
    expect(root.querySelector('#point-fly-layer')!.children.length).toBe(1);
    vi.advanceTimersByTime(750);
    expect(root.querySelector('#point-fly-layer')!.children.length).toBe(0);
    ui.dispose();
  });

  it('dispose removes the layer from the DOM', () => {
    const ui = createPointFlyUI(root);
    expect(root.querySelector('#point-fly-layer')).toBeTruthy();
    ui.dispose();
    expect(root.querySelector('#point-fly-layer')).toBeNull();
  });
});
