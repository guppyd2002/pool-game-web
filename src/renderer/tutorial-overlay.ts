/**
 * Landscape tutorial overlay — first 3 shots only (SP-Harden-3 contextual).
 *
 * Contextual display (no contradictory concurrent copy):
 *   Step 1  "Tap the table to aim"     — only while awaiting aim (hidden mid-shot)
 *   Step 2  "Fine-Aim bar (optional)"  — briefly after aim set
 *   Step 3  "Pull power · Release"     — while powering / ready to fire
 *   hidden                             — during simulation / after fire until next turn
 *
 * Kakashi smoke: step-1 pill stayed up through hit/after and clashed with
 * "Release to shoot". onShot now hides immediately; onTurnReady re-shows step 1.
 */

export interface TutorialOverlay {
  /** Call at game start to show from step 1. */
  start(): void;
  /** Advance step on first table tap (aim set). */
  onAimSet(): void;
  /** Advance step when power bar is first dragged. */
  onPowerStart(): void;
  /** Hide during shot; count toward 3-shot dismiss. */
  onShot(): void;
  /**
   * Call when the human turn is ready to aim again (post-replay).
   * Re-shows step 1 if tutorial not finished.
   */
  onTurnReady(): void;
  dispose(): void;
}

type Step = 1 | 2 | 3 | 'hidden' | 'done';

export function createTutorialOverlay(container: HTMLElement): TutorialOverlay {
  let _step: Step = 'done';
  let _shotCount = 0;
  let _fineAimTimer: ReturnType<typeof setTimeout> | null = null;

  const pill = document.createElement('div');
  pill.style.cssText = [
    'position:absolute',
    'bottom:max(56px, calc(48px + env(safe-area-inset-bottom, 0px)))',
    'left:50%', 'transform:translateX(-50%)',
    'background:rgba(0,0,0,0.82)', 'color:#fff',
    'padding:8px 14px 8px 20px', 'border-radius:20px',
    'font-family:sans-serif', 'font-size:13px',
    'pointer-events:auto',
    'z-index:150',
    'display:none',
    'align-items:center', 'gap:12px', 'white-space:nowrap',
    'border:1px solid rgba(255,255,255,0.2)',
    'transition:opacity 0.25s',
    'max-width:min(92vw, 420px)',
  ].join(';');
  container.appendChild(pill);

  const textEl = document.createElement('span');
  textEl.style.pointerEvents = 'none';
  pill.appendChild(textEl);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = [
    'background:none', 'border:none', 'color:rgba(255,255,255,0.6)',
    'font-size:14px', 'cursor:pointer', 'padding:0 4px',
    'line-height:1', 'pointer-events:auto',
  ].join(';');
  closeBtn.setAttribute('aria-label', 'Dismiss tutorial');
  pill.appendChild(closeBtn);

  const STEPS: Record<1 | 2 | 3, string> = {
    1: '👆 Tap the table to aim',
    2: '← Fine-Aim bar (optional) →',
    3: '↓ Pull power bar · Release to shoot',
  };

  function _clearFineTimer(): void {
    if (_fineAimTimer !== null) {
      clearTimeout(_fineAimTimer);
      _fineAimTimer = null;
    }
  }

  function _show(step: 1 | 2 | 3): void {
    textEl.textContent = STEPS[step];
    pill.style.display = 'flex';
    void pill.offsetWidth;
    pill.style.opacity = '1';
  }

  function _hide(): void {
    pill.style.opacity = '0';
    setTimeout(() => {
      if (_step === 'hidden' || _step === 'done') pill.style.display = 'none';
    }, 250);
  }

  closeBtn.addEventListener('click', () => {
    _clearFineTimer();
    _step = 'done';
    _hide();
  });

  return {
    start(): void {
      _clearFineTimer();
      _shotCount = 0;
      _step = 1;
      _show(1);
    },

    onAimSet(): void {
      if (_step === 'done' || _step === 'hidden') return;
      if (_step === 1 || _step === 2) {
        _step = 2;
        _show(2);
        _clearFineTimer();
        _fineAimTimer = setTimeout(() => {
          if (_step === 2) {
            _step = 3;
            _show(3);
          }
        }, 2000);
      }
    },

    onPowerStart(): void {
      if (_step === 'done' || _step === 'hidden') return;
      _clearFineTimer();
      _step = 3;
      _show(3);
    },

    onShot(): void {
      _clearFineTimer();
      _shotCount++;
      if (_shotCount >= 3) {
        _step = 'done';
        _hide();
      } else {
        _step = 'hidden';
        _hide();
      }
    },

    onTurnReady(): void {
      if (_step === 'done') return;
      if (_step === 'hidden' || _step === 1) {
        _step = 1;
        _show(1);
      }
    },

    dispose(): void {
      _clearFineTimer();
      if (pill.parentNode) pill.parentNode.removeChild(pill);
    },
  };
}
