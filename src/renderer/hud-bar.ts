/**
 * Landscape HUD — top full-width strip (UI-024 / UI-028 / UI-004 / UI-016 controls).
 *
 * Phase 1 #3 layout (single row; F-2b-3 height 44px):
 *   [P1][7 slots] | [timer · turn] | [7 slots][P2] | [icons…]
 * Ball slots previously lived in a second strip (player-ball-hud); merged here.
 */

import { makeBallSlotEl } from './player-ball-hud';

export interface HudBar {
  setPlayerTurn(playerIndex: 0 | 1, isBallInHand: boolean): void;
  /** 7-slot hosts for createPlayerBallHud paint adapter. */
  readonly ballSlotHosts: { p0: HTMLElement[]; p1: HTMLElement[] };
  /**
   * UI-024 countdown. remainingS ≥ 0; urgency styles the digit colour.
   * Pass null to hide timer (e.g. mid-replay).
   */
  setTimer(remainingS: number | null, urgency?: 'normal' | 'warn' | 'critical'): void;
  setVisible(visible: boolean): void;
  setTopViewLabel(label: string): void;
  setLeftHandActive(active: boolean): void;
  setFineAimActive(active: boolean): void;
  /** CUE-008: aim-line / ghost assist toggle chrome state. */
  setAimAssistActive(active: boolean): void;
  /** UI-016: dim/hide non-essential chrome while waiting (optional). */
  setControlsEnabled(enabled: boolean): void;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createHudBar(container: HTMLElement, opts: {
  onToggleView: () => void;
  onToggleLeftHand: () => void;
  onToggleFineAim: () => void;
  /** CUE-008 — toggle aim line / ghost ball assist */
  onToggleAimAssist?: () => void;
  /** UI-004 — leave table back to main menu */
  onExit?: () => void;
}): HudBar {
  const bar = document.createElement('div');
  bar.id = 'hud-bar';
  // Phase 1 #4 + F-2b-3: min-height 44px bar.
  // P0 wrap stopgap (gutter_top≈230): min-height + flex-wrap so Exit/LeftHand stay in-viewport.
  // ⛔ F-4′ expiry (必要條件，非謹慎起見): when portrait+rotate lands, REMOVE flex-wrap +
  // height:auto (restore fixed height:44). QA@2983c67: rotate gutter_top=66.39, bar rect=70
  // ⇒ 餘裕 −3.61px (not estimate). Step 2 (dual-row slots + side gutter buttons) with F-4.
  // No --hud-bar-height token: P0 height:auto can render 88px; a constant 44 would lie.
  // If a sibling needs positioning later, publish getBoundingClientRect().height (measured).
  const HUD_BAR_HEIGHT_PX = 44;
  bar.style.cssText = [
    'position:absolute', 'top:0', 'left:0', 'right:0',
    `min-height:${HUD_BAR_HEIGHT_PX}px`,
    'height:auto',
    `max-height:max(${HUD_BAR_HEIGHT_PX}px, var(--gutter-top, ${HUD_BAR_HEIGHT_PX}px))`,
    'padding-left:max(8px, env(safe-area-inset-left, 0px))',
    'padding-right:max(8px, env(safe-area-inset-right, 0px))',
    'padding-top:env(safe-area-inset-top, 0px)',
    'background:rgba(0,0,0,0.80)',
    'display:flex', 'flex-wrap:wrap', 'align-items:center',
    'z-index:200',
    'font-family:sans-serif', 'font-size:12px', 'color:#fff',
    'gap:8px',
  ].join(';');

  const p1El = document.createElement('div');
  p1El.style.cssText = 'flex:0 0 auto;opacity:0.75;white-space:nowrap;font-weight:bold;';
  p1El.textContent = 'P1';

  const p0SlotsWrap = document.createElement('div');
  p0SlotsWrap.style.cssText = 'display:flex;align-items:center;gap:2px;flex:0 0 auto;';
  p0SlotsWrap.setAttribute('aria-label', 'Player 1 balls');
  const p0Slots: HTMLElement[] = [];
  for (let i = 0; i < 7; i++) {
    const s = makeBallSlotEl();
    p0Slots.push(s);
    p0SlotsWrap.appendChild(s);
  }

  const centreEl = document.createElement('div');
  centreEl.style.cssText =
    'flex:1;text-align:center;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;';

  const timerEl = document.createElement('span');
  timerEl.id = 'hud-timer';
  timerEl.style.cssText =
    'font-variant-numeric:tabular-nums;font-size:13px;min-width:2.5em;opacity:0.95;';
  timerEl.textContent = '';

  const turnEl = document.createElement('span');
  turnEl.textContent = '8-Ball Pool';

  centreEl.appendChild(timerEl);
  centreEl.appendChild(turnEl);

  const p1SlotsWrap = document.createElement('div');
  p1SlotsWrap.style.cssText = 'display:flex;align-items:center;gap:2px;flex:0 0 auto;';
  p1SlotsWrap.setAttribute('aria-label', 'Player 2 balls');
  const p1Slots: HTMLElement[] = [];
  for (let i = 0; i < 7; i++) {
    const s = makeBallSlotEl();
    p1Slots.push(s);
    p1SlotsWrap.appendChild(s);
  }

  const p2El = document.createElement('div');
  p2El.style.cssText = 'flex:0 0 auto;opacity:0.75;white-space:nowrap;font-weight:bold;';
  p2El.textContent = 'P2';

  // Phase 1 #6: two groups (view | session), gap ≥10px within, ≥44×44 tap.
  const ctrlEl = document.createElement('div');
  ctrlEl.setAttribute('data-hud-controls', '1');
  ctrlEl.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:14px;';

  const viewGroup = document.createElement('div');
  viewGroup.setAttribute('data-hud-icon-group', 'view');
  viewGroup.style.cssText = 'display:flex;align-items:center;gap:10px;';

  const sessionGroup = document.createElement('div');
  sessionGroup.setAttribute('data-hud-icon-group', 'session');
  sessionGroup.style.cssText = 'display:flex;align-items:center;gap:10px;';

  const groupSep = document.createElement('div');
  groupSep.setAttribute('aria-hidden', 'true');
  groupSep.setAttribute('data-hud-icon-sep', '1');
  groupSep.style.cssText =
    'width:1px;height:18px;background:rgba(255,255,255,0.28);flex:0 0 auto;';

  function _mkBtn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    b.style.cssText = [
      'background:rgba(255,255,255,0.10)', 'color:#fff',
      'border:1px solid rgba(255,255,255,0.25)',
      'padding:2px 7px', 'border-radius:4px',
      'font-size:11px', 'cursor:pointer',
      // Apple HIG / Phase 1 #6: tap-target ≥44×44 (visual chrome stays compact via padding).
      'min-height:44px', 'min-width:44px',
      'box-sizing:border-box',
      'font-family:sans-serif',
      'display:inline-flex', 'align-items:center', 'justify-content:center',
    ].join(';');
    b.addEventListener('click', onClick);
    return b;
  }

  const topViewBtn = _mkBtn('⬆ Top', 'Toggle top view (T)', opts.onToggleView);
  const fineAimBtn = _mkBtn('⌖', 'Fine aim mode (Shift)', opts.onToggleFineAim);
  const aimAssistBtn = _mkBtn('◎', 'Aim assist lines (CUE-008)', () => {
    opts.onToggleAimAssist?.();
  });
  if (!opts.onToggleAimAssist) {
    aimAssistBtn.style.display = 'none';
  }
  const leftHandBtn = _mkBtn('🤚', 'Left-hand mode', opts.onToggleLeftHand);

  viewGroup.appendChild(topViewBtn);
  viewGroup.appendChild(fineAimBtn);
  viewGroup.appendChild(aimAssistBtn);
  sessionGroup.appendChild(leftHandBtn);

  if (opts.onExit) {
    const exitBtn = _mkBtn('✕', 'Exit to menu (UI-004)', opts.onExit);
    exitBtn.style.background = 'rgba(255,80,80,0.25)';
    sessionGroup.appendChild(exitBtn);
  }

  ctrlEl.appendChild(viewGroup);
  ctrlEl.appendChild(groupSep);
  ctrlEl.appendChild(sessionGroup);

  bar.appendChild(p1El);
  bar.appendChild(p0SlotsWrap);
  bar.appendChild(centreEl);
  bar.appendChild(p1SlotsWrap);
  bar.appendChild(p2El);
  bar.appendChild(ctrlEl);
  container.appendChild(bar);

  return {
    get element() {
      return bar;
    },

    ballSlotHosts: { p0: p0Slots, p1: p1Slots },

    setPlayerTurn(playerIndex: 0 | 1, isBallInHand: boolean): void {
      const label = `Player ${playerIndex + 1}`;
      turnEl.textContent = isBallInHand ? `${label} — Place cue ball` : `${label}'s turn`;
      p1El.style.opacity = playerIndex === 0 ? '1' : '0.45';
      p2El.style.opacity = playerIndex === 1 ? '1' : '0.45';
      p1El.style.textDecoration = playerIndex === 0 ? 'underline' : 'none';
      p2El.style.textDecoration = playerIndex === 1 ? 'underline' : 'none';
    },

    setTimer(remainingS, urgency = 'normal'): void {
      if (remainingS == null) {
        timerEl.textContent = '';
        return;
      }
      const s = Math.ceil(remainingS);
      timerEl.textContent = `${s}s`;
      if (urgency === 'critical') timerEl.style.color = '#ff5252';
      else if (urgency === 'warn') timerEl.style.color = '#ffc107';
      else timerEl.style.color = '#fff';
    },

    setVisible(visible: boolean): void {
      bar.style.display = visible ? 'flex' : 'none';
    },

    setTopViewLabel(label: string): void {
      topViewBtn.textContent = label;
    },

    setLeftHandActive(active: boolean): void {
      leftHandBtn.style.background = active
        ? 'rgba(76,175,80,0.4)'
        : 'rgba(255,255,255,0.10)';
    },

    setFineAimActive(active: boolean): void {
      fineAimBtn.style.background = active
        ? 'rgba(76,175,80,0.4)'
        : 'rgba(255,255,255,0.10)';
    },

    setAimAssistActive(active: boolean): void {
      aimAssistBtn.style.background = active
        ? 'rgba(76,175,80,0.4)'
        : 'rgba(255,255,255,0.10)';
    },

    setControlsEnabled(enabled: boolean): void {
      ctrlEl.style.opacity = enabled ? '1' : '0.35';
      ctrlEl.style.pointerEvents = enabled ? 'auto' : 'none';
    },

    dispose(): void {
      container.removeChild(bar);
    },
  };
}
