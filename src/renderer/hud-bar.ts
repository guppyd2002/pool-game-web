/**
 * Landscape HUD — top full-width 36dp strip.
 *
 * Layout: [P1] | [turn info] | [P2] | [TopView] [FineAim] [LeftHand]
 * Background: #000 80% opacity, white text, WCAG AAA contrast (ratio >7:1).
 */

export interface HudBar {
  setPlayerTurn(playerIndex: 0 | 1, isBallInHand: boolean): void;
  setVisible(visible: boolean): void;
  setTopViewLabel(label: string): void;
  setLeftHandActive(active: boolean): void;
  setFineAimActive(active: boolean): void;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createHudBar(container: HTMLElement, opts: {
  onToggleView: () => void;
  onToggleLeftHand: () => void;
  onToggleFineAim: () => void;
}): HudBar {
  const bar = document.createElement('div');
  bar.style.cssText = [
    'position:absolute', 'top:0', 'left:0', 'right:0',
    'height:36px',
    'padding-left:max(8px, env(safe-area-inset-left, 0px))',
    'padding-right:max(8px, env(safe-area-inset-right, 0px))',
    'padding-top:env(safe-area-inset-top, 0px)',
    'background:rgba(0,0,0,0.80)',
    'display:flex', 'align-items:center',
    'z-index:200',
    'font-family:sans-serif', 'font-size:12px', 'color:#fff',
    'gap:8px',
  ].join(';');

  const p1El = document.createElement('div');
  p1El.style.cssText = 'flex:0 0 auto;opacity:0.75;white-space:nowrap;font-weight:bold;';
  p1El.textContent = 'P1';

  const centreEl = document.createElement('div');
  centreEl.style.cssText = 'flex:1;text-align:center;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  centreEl.textContent = '8-Ball Pool';

  const p2El = document.createElement('div');
  p2El.style.cssText = 'flex:0 0 auto;opacity:0.75;white-space:nowrap;font-weight:bold;';
  p2El.textContent = 'P2';

  const ctrlEl = document.createElement('div');
  ctrlEl.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:4px;';

  function _mkBtn(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.style.cssText = [
      'background:rgba(255,255,255,0.10)', 'color:#fff',
      'border:1px solid rgba(255,255,255,0.25)',
      'padding:2px 7px', 'border-radius:4px',
      'font-size:11px', 'cursor:pointer',
      'min-height:28px', 'min-width:44px',
      'font-family:sans-serif',
    ].join(';');
    b.addEventListener('click', onClick);
    return b;
  }

  const topViewBtn = _mkBtn('⬆ Top', 'Toggle top view (T)', opts.onToggleView);
  const leftHandBtn = _mkBtn('🤚', 'Left-hand mode', opts.onToggleLeftHand);
  leftHandBtn.style.minWidth = '36px';
  const fineAimBtn = _mkBtn('⌖', 'Fine aim mode (Shift)', opts.onToggleFineAim);
  fineAimBtn.style.minWidth = '36px';

  ctrlEl.appendChild(topViewBtn);
  ctrlEl.appendChild(fineAimBtn);
  ctrlEl.appendChild(leftHandBtn);

  bar.appendChild(p1El);
  bar.appendChild(centreEl);
  bar.appendChild(p2El);
  bar.appendChild(ctrlEl);
  container.appendChild(bar);

  return {
    get element() { return bar; },

    setPlayerTurn(playerIndex: 0 | 1, isBallInHand: boolean): void {
      const label = `Player ${playerIndex + 1}`;
      centreEl.textContent = isBallInHand ? `${label} — Place cue ball` : `${label}'s turn`;
      p1El.style.opacity = playerIndex === 0 ? '1' : '0.45';
      p2El.style.opacity = playerIndex === 1 ? '1' : '0.45';
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

    dispose(): void {
      container.removeChild(bar);
    },
  };
}
