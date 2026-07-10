/**
 * GAME-005/015 — Game Over / exit screen.
 * Shows winner, reason message, Play Again and Exit buttons.
 * C# equivalent: BallPool8UI (win/loss panels) + GameManager exit handlers.
 */

export interface GameOverUI {
  show(winner: 0 | 1 | null, reason: string): void;
  hide(): void;
  onPlayAgain: (() => void) | null;
  onExit: (() => void) | null;
  /** Set to enable the Download Replay button; null hides the button. */
  onDownloadRecord: (() => void) | null;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createGameOverUI(container: HTMLElement): GameOverUI {
  const el = document.createElement('div');
  el.id = 'game-over';
  el.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'background:rgba(0,0,0,0.72)',
    'color:#fff',
    'font-family:sans-serif',
    'z-index:200',
  ].join(';');

  el.innerHTML = [
    '<div id="go-title" style="font-size:32px;margin-bottom:12px;font-weight:bold;"></div>',
    '<div id="go-reason" style="font-size:16px;margin-bottom:28px;opacity:0.85;"></div>',
    '<div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">',
    '  <button id="go-replay" style="padding:10px 28px;font-size:16px;border-radius:4px;cursor:pointer;border:none;background:#4caf50;color:#fff;">Play Again</button>',
    '  <button id="go-dl"     style="padding:10px 28px;font-size:16px;border-radius:4px;cursor:pointer;border:none;background:#1976d2;color:#fff;display:none;">⬇ Download Replay</button>',
    '  <button id="go-exit"   style="padding:10px 28px;font-size:16px;border-radius:4px;cursor:pointer;border:none;background:#555;color:#fff;">Exit</button>',
    '</div>',
  ].join('');

  container.appendChild(el);

  const titleEl   = el.querySelector('#go-title')  as HTMLElement;
  const reasonEl  = el.querySelector('#go-reason') as HTMLElement;
  const replayBtn = el.querySelector('#go-replay') as HTMLButtonElement;
  const dlBtn     = el.querySelector('#go-dl')     as HTMLButtonElement;
  const exitBtn   = el.querySelector('#go-exit')   as HTMLButtonElement;

  const ui: GameOverUI = {
    onPlayAgain: null,
    onExit: null,
    onDownloadRecord: null,
    get element() { return el; },

    show(winner: 0 | 1 | null, reason: string): void {
      titleEl.textContent = winner === null ? 'Draw!' : `Player ${winner + 1} wins!`;
      reasonEl.textContent = reason;
      dlBtn.style.display = ui.onDownloadRecord ? 'inline-block' : 'none';
      el.style.display = 'flex';
    },

    hide(): void {
      el.style.display = 'none';
    },

    dispose(): void {
      el.remove();
    },
  };

  replayBtn.addEventListener('click', () => ui.onPlayAgain?.());
  dlBtn.addEventListener('click', () => ui.onDownloadRecord?.());
  exitBtn.addEventListener('click', () => ui.onExit?.());

  return ui;
}
