/**
 * Landscape tutorial overlay — first 3 shots only.
 *
 * Step 1: Tap the table to aim.
 * Step 2: Fine-adjust bar (optional, can skip).
 * Step 3: Pull power bar down, release to shoot.
 *
 * Each step shows a highlight pill with an ✕ close button.
 * Advances automatically on the relevant interaction.
 * Disappears after 3 shots or when the player taps ✕.
 */

export interface TutorialOverlay {
  /** Call at game start to show from step 1. */
  start(): void;
  /** Advance step on first table tap (aim set). */
  onAimSet(): void;
  /** Advance step when power bar is first dragged. */
  onPowerStart(): void;
  /** Dismiss entirely after first shot fires. */
  onShot(): void;
  dispose(): void;
}

type Step = 1 | 2 | 3 | 'done';

export function createTutorialOverlay(container: HTMLElement): TutorialOverlay {
  let _step: Step = 'done';
  let _shotCount = 0;

  // Outer row: text + close button side-by-side.
  const pill = document.createElement('div');
  pill.style.cssText = [
    'position:absolute', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(0,0,0,0.82)', 'color:#fff',
    'padding:8px 14px 8px 20px', 'border-radius:20px',
    'font-family:sans-serif', 'font-size:13px',
    'pointer-events:auto',            // allow close button tap
    'z-index:150',
    'display:none',
    'align-items:center', 'gap:12px', 'white-space:nowrap',
    'border:1px solid rgba(255,255,255,0.2)',
    'transition:opacity 0.3s',
  ].join(';');
  container.appendChild(pill);

  const textEl = document.createElement('span');
  textEl.style.pointerEvents = 'none';
  pill.appendChild(textEl);

  // Close (✕) button — visible target for "dismiss tutorial".
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = [
    'background:none', 'border:none', 'color:rgba(255,255,255,0.6)',
    'font-size:14px', 'cursor:pointer', 'padding:0 4px',
    'line-height:1', 'pointer-events:auto',
  ].join(';');
  closeBtn.setAttribute('aria-label', 'Dismiss tutorial');
  pill.appendChild(closeBtn);

  const STEPS: Record<Exclude<Step, 'done'>, string> = {
    1: '👆 Tap the table to aim',
    2: '← Fine-Aim bar (optional) →',
    3: '↓ Pull power bar · Release to shoot',
  };

  function _show(step: Exclude<Step, 'done'>): void {
    textEl.textContent = STEPS[step];
    pill.style.display = 'flex';
    pill.style.opacity = '1';
  }

  function _hide(): void {
    pill.style.opacity = '0';
    setTimeout(() => { pill.style.display = 'none'; }, 300);
  }

  // Close button dismisses tutorial entirely.
  closeBtn.addEventListener('click', () => {
    _step = 'done';
    _hide();
  });

  return {
    start(): void {
      _shotCount = 0;
      _step = 1;
      _show(1);
    },

    onAimSet(): void {
      if (_step === 1) {
        _step = 2;
        _show(2);
        // Auto-advance to step 3 after 2s (fine-aim is optional)
        setTimeout(() => {
          if (_step === 2) { _step = 3; _show(3); }
        }, 2000);
      }
    },

    onPowerStart(): void {
      if (_step === 2 || _step === 3) {
        _step = 3;
        _show(3);
      }
    },

    onShot(): void {
      _shotCount++;
      if (_shotCount >= 3) {
        _step = 'done';
        _hide();
      } else if (_step !== 'done') {
        _step = 1;
        _show(1);
      }
    },

    dispose(): void {
      if (pill.parentNode) pill.parentNode.removeChild(pill);
    },
  };
}
