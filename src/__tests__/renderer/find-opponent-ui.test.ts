/**
 * UI-025 find-opponent unit tests (P1-T07 HotSeat).
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFindOpponentUI } from '../../renderer/find-opponent-ui';

describe('createFindOpponentUI (T07 / UI-025)', () => {
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

  it('starts hidden and mounts into container', () => {
    const ui = createFindOpponentUI(root);
    const el = root.querySelector('#find-opponent') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.display).toBe('none');
    ui.dispose();
  });

  it('play shows overlay, rolls avatars, then calls onDone and hides', () => {
    const ui = createFindOpponentUI(root);
    const onDone = vi.fn();
    ui.play(onDone);

    const el = root.querySelector('#find-opponent') as HTMLElement;
    expect(el.style.display).toBe('flex');

    // 18 rolls × 60ms + final 450ms settle
    vi.advanceTimersByTime(18 * 60);
    const nameEl = root.querySelector('#fo-name') as HTMLElement;
    expect(nameEl.textContent).toBe('Player 2 — HotSeat');
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(el.style.display).toBe('none');
    ui.dispose();
  });

  it('play is no-op while already playing (no double onDone)', () => {
    const ui = createFindOpponentUI(root);
    const a = vi.fn();
    const b = vi.fn();
    ui.play(a);
    ui.play(b); // ignored
    vi.advanceTimersByTime(18 * 60 + 450);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    ui.dispose();
  });

  it('dispose clears timers so onDone never fires after dispose mid-play', () => {
    const ui = createFindOpponentUI(root);
    const onDone = vi.fn();
    ui.play(onDone);
    ui.dispose();
    vi.advanceTimersByTime(18 * 60 + 450);
    expect(onDone).not.toHaveBeenCalled();
    expect(root.querySelector('#find-opponent')).toBeNull();
  });
});
