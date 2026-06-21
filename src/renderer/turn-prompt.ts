/**
 * B4 — TurnPrompt: clear turn-change instruction overlay.
 *
 * Shows "Player N's turn — drag the cue ball to aim" on turn change.
 * Fades out when the player starts their first drag (dismiss() called from onAimUpdate).
 */

export interface TurnPrompt {
  show(playerIndex: 0 | 1, ballInHand: boolean): void;
  /** Call when player begins interacting — fades out and hides. */
  dismiss(): void;
  dispose(): void;
}

export function createTurnPrompt(container: HTMLElement): TurnPrompt {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute', 'left:50%', 'top:38%',
    'transform:translate(-50%,-50%)',
    'background:rgba(10,10,26,0.82)',
    'color:#fff', 'font-family:sans-serif',
    'font-size:17px', 'font-weight:600',
    'padding:16px 32px', 'border-radius:12px',
    'border:1px solid rgba(255,255,255,0.15)',
    'text-align:center', 'pointer-events:none',
    'transition:opacity 0.35s',
    'opacity:0', 'display:none',
    'z-index:200',
  ].join(';');
  container.appendChild(el);

  let _hideTimer = 0;

  function _fadeOut(): void {
    el.style.opacity = '0';
    _hideTimer = window.setTimeout(() => { el.style.display = 'none'; }, 380);
  }

  return {
    show(playerIndex, ballInHand) {
      clearTimeout(_hideTimer);
      const player = `Player ${playerIndex + 1}`;
      const action = ballInHand ? 'Click to place cue ball' : 'Drag the cue ball to aim';
      el.innerHTML = [
        `<div style="font-size:14px;opacity:0.65;margin-bottom:4px">${player}'s turn</div>`,
        `<div style="font-size:16px">${action}</div>`,
      ].join('');
      el.style.display = 'block';
      el.offsetHeight;  // force reflow so transition plays
      el.style.opacity = '1';
    },

    dismiss() {
      if (el.style.display === 'none') return;
      _fadeOut();
    },

    dispose() {
      clearTimeout(_hideTimer);
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
