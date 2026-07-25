/**
 * B4 — TurnPrompt: turn-change player indicator.
 *
 * Shows "Player N's turn" briefly (auto-fades after 2 s or on first interaction).
 * No action instructions — tutorial-overlay handles those to avoid conflicting text.
 */

export interface TurnPrompt {
  show(playerIndex: 0 | 1, ballInHand: boolean): void;
  /** Call when player begins interacting — fades out and hides. */
  dismiss(): void;
  dispose(): void;
}

/** Auto-dismiss delay in ms — long enough to read, short enough not to block view. */
const AUTO_DISMISS_MS = 2000;

export function createTurnPrompt(container: HTMLElement): TurnPrompt {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute', 'left:50%', 'top:12%',
    'transform:translateX(-50%)',
    'background:rgba(10,10,26,0.78)',
    'color:#fff', 'font-family:sans-serif',
    'font-size:15px', 'font-weight:600',
    'padding:8px 24px', 'border-radius:20px',
    'border:1px solid rgba(255,255,255,0.15)',
    'text-align:center', 'pointer-events:none',
    'transition:opacity 0.35s',
    'opacity:0', 'display:none',
    'z-index:200',
  ].join(';');
  container.appendChild(el);

  let _hideTimer = 0;
  let _autoTimer = 0;

  function _fadeOut(): void {
    clearTimeout(_autoTimer);
    el.style.opacity = '0';
    _hideTimer = window.setTimeout(() => { el.style.display = 'none'; }, 380);
  }

  return {
    show(playerIndex, ballInHand) {
      clearTimeout(_hideTimer);
      clearTimeout(_autoTimer);
      // Only show player label — no action text (tutorial-overlay handles instructions).
      const label = ballInHand
        ? `Player ${playerIndex + 1}'s turn — place cue ball`
        : `Player ${playerIndex + 1}'s turn`;
      el.textContent = label;
      el.style.display = 'block';
      el.offsetHeight;  // force reflow so transition plays
      el.style.opacity = '1';
      // Auto-dismiss so it doesn't linger on top of the tutorial overlay.
      _autoTimer = window.setTimeout(_fadeOut, AUTO_DISMISS_MS);
    },

    dismiss() {
      if (el.style.display === 'none') return;
      _fadeOut();
    },

    dispose() {
      clearTimeout(_hideTimer);
      clearTimeout(_autoTimer);
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
