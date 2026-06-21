/**
 * LOC-003 reason-message overlay.
 * Shows a timed banner with the shot/foul/turn reason.
 * C# equivalent: BallPool8UI.ShowMessage / RPCMessages.OnShwoMessage.
 */

export interface ReasonBanner {
  show(message: string): void;
  hide(): void;
  readonly element: HTMLElement;
  dispose(): void;
}

export function createReasonBanner(container: HTMLElement): ReasonBanner {
  const el = document.createElement('div');
  el.id = 'reason-banner';
  el.style.cssText = [
    'position:absolute',
    'top:20px',
    'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(0,0,0,0.78)',
    'color:#fff',
    'padding:8px 18px',
    'border-radius:6px',
    'font-family:sans-serif',
    'font-size:14px',
    'font-weight:500',
    'pointer-events:none',
    'display:none',
    'z-index:100',
    'white-space:nowrap',
  ].join(';');
  container.appendChild(el);

  let _timerId = 0;

  function _clearTimer(): void {
    if (_timerId) {
      window.clearTimeout(_timerId);
      _timerId = 0;
    }
  }

  return {
    get element() { return el; },

    show(message: string): void {
      if (!message) return;
      _clearTimer();
      el.textContent = message;
      el.style.display = 'block';
      _timerId = window.setTimeout(() => {
        el.style.display = 'none';
        _timerId = 0;
      }, 3000);
    },

    hide(): void {
      _clearTimer();
      el.style.display = 'none';
    },

    dispose(): void {
      _clearTimer();
      el.remove();
    },
  };
}
