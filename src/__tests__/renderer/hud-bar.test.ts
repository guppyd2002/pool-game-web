/**
 * Landscape HUD bar unit tests (P1-T07 UI-024/028/004/016).
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHudBar } from '../../renderer/hud-bar';

describe('createHudBar (T07)', () => {
  let root: HTMLElement;
  let onToggleView: ReturnType<typeof vi.fn>;
  let onToggleLeftHand: ReturnType<typeof vi.fn>;
  let onToggleFineAim: ReturnType<typeof vi.fn>;
  let onToggleAimAssist: ReturnType<typeof vi.fn>;
  let onExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    onToggleView = vi.fn();
    onToggleLeftHand = vi.fn();
    onToggleFineAim = vi.fn();
    onToggleAimAssist = vi.fn();
    onExit = vi.fn();
  });

  afterEach(() => {
    root.remove();
  });

  function makeHud(extra: { aim?: boolean; exit?: boolean } = {}) {
    return createHudBar(root, {
      onToggleView,
      onToggleLeftHand,
      onToggleFineAim,
      onToggleAimAssist: extra.aim === false ? undefined : onToggleAimAssist,
      onExit: extra.exit === false ? undefined : onExit,
    });
  }

  it('mounts #hud-bar and wires control clicks', () => {
    const hud = makeHud();
    expect(root.querySelector('#hud-bar')).toBe(hud.element);
    const buttons = [...hud.element.querySelectorAll('button')];
    // Top, Fine, AimAssist, LeftHand, Exit
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    buttons[0].click(); // top view
    expect(onToggleView).toHaveBeenCalledTimes(1);
    hud.dispose();
  });

  it('hides aim-assist button when onToggleAimAssist omitted', () => {
    const hud = makeHud({ aim: false });
    const aimBtn = [...hud.element.querySelectorAll('button')].find((b) => b.title.includes('Aim assist'));
    expect(aimBtn).toBeTruthy();
    expect((aimBtn as HTMLElement).style.display).toBe('none');
    hud.dispose();
  });

  it('setPlayerTurn highlights active seat and shows BIH place text', () => {
    const hud = makeHud();
    hud.setPlayerTurn(0, false);
    const turn = [...hud.element.querySelectorAll('span')].find((s) => s.id !== 'hud-timer')!;
    expect(turn.textContent).toContain("Player 1's turn");
    hud.setPlayerTurn(1, true);
    expect(turn.textContent).toBe('Player 2 — Place cue ball');
    hud.dispose();
  });

  it('setTimer formats seconds and applies urgency colors; null clears', () => {
    const hud = makeHud();
    const timer = hud.element.querySelector('#hud-timer') as HTMLElement;
    hud.setTimer(12.2, 'normal');
    expect(timer.textContent).toBe('13s'); // Math.ceil
    expect(timer.style.color).toBe('#fff');
    hud.setTimer(3, 'warn');
    expect(timer.style.color).toBe('#ffc107');
    hud.setTimer(1, 'critical');
    expect(timer.style.color).toBe('#ff5252');
    hud.setTimer(null);
    expect(timer.textContent).toBe('');
    hud.dispose();
  });

  it('setVisible / setControlsEnabled toggle chrome', () => {
    const hud = makeHud();
    hud.setVisible(false);
    expect(hud.element.style.display).toBe('none');
    hud.setVisible(true);
    expect(hud.element.style.display).toBe('flex');

    hud.setControlsEnabled(false);
    const ctrl = hud.element.lastElementChild as HTMLElement;
    expect(ctrl.style.pointerEvents).toBe('none');
    expect(ctrl.style.opacity).toBe('0.35');
    hud.setControlsEnabled(true);
    expect(ctrl.style.pointerEvents).toBe('auto');
    hud.dispose();
  });

  it('active-state setters light control backgrounds', () => {
    const hud = makeHud();
    hud.setLeftHandActive(true);
    hud.setFineAimActive(true);
    hud.setAimAssistActive(true);
    const buttons = [...hud.element.querySelectorAll('button')] as HTMLButtonElement[];
    // backgrounds use green tint when active
    const greens = buttons.filter((b) => b.style.background.includes('76, 175, 80') || b.style.background.includes('76,175,80'));
    expect(greens.length).toBeGreaterThanOrEqual(2);
    hud.setTopViewLabel('⬇ Table');
    expect(buttons[0].textContent).toBe('⬇ Table');
    hud.dispose();
  });

  it('dispose removes bar from container', () => {
    const hud = makeHud();
    hud.dispose();
    expect(root.querySelector('#hud-bar')).toBeNull();
  });
});
