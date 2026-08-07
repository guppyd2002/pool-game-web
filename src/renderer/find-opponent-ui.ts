/**
 * UI-025 — find-opponent avatar carousel (P1-T07 HotSeat).
 * C# BallPool8UI.FindOpponent / AnimateOpponent — rapid avatar roll then lock.
 * P1 HotSeat: short theatrical roll then "P2 ready" → callback starts game.
 */

export interface FindOpponentUI {
  /**
   * Play carousel animation then invoke onDone.
   * No-op if already playing.
   */
  play(onDone: () => void): void;
  dispose(): void;
}

const AVATARS = ['🎱', '🎯', '🏆', '⭐', '🔥', '💎', '🎲', '👑'];

export function createFindOpponentUI(container: HTMLElement): FindOpponentUI {
  const el = document.createElement('div');
  el.id = 'find-opponent';
  el.style.cssText = [
    'position:absolute', 'inset:0',
    'display:none', 'flex-direction:column',
    'align-items:center', 'justify-content:center',
    'background:rgba(10,10,26,0.88)',
    'color:#fff', 'font-family:sans-serif',
    'z-index:320',
  ].join(';');
  el.innerHTML = [
    '<div style="font-size:14px;opacity:0.75;margin-bottom:16px;letter-spacing:1px;">FINDING OPPONENT…</div>',
    '<div id="fo-avatar" style="font-size:64px;line-height:1;min-height:72px;"></div>',
    '<div id="fo-name" style="margin-top:14px;font-size:18px;font-weight:700;">…</div>',
  ].join('');
  container.appendChild(el);

  const avatarEl = el.querySelector('#fo-avatar') as HTMLElement;
  const nameEl = el.querySelector('#fo-name') as HTMLElement;
  let _playing = false;
  let _timers: number[] = [];

  function _clear(): void {
    for (const t of _timers) window.clearTimeout(t);
    _timers = [];
  }

  return {
    play(onDone): void {
      if (_playing) return;
      _playing = true;
      _clear();
      el.style.display = 'flex';
      let i = 0;
      const rollMs = 60;
      const rolls = 18; // ~1.1s spin

      function step(): void {
        avatarEl.textContent = AVATARS[i % AVATARS.length];
        nameEl.textContent = `Player ${((i % 8) + 2)}`;
        i++;
        if (i < rolls) {
          _timers.push(window.setTimeout(step, rollMs));
        } else {
          avatarEl.textContent = '🎱';
          nameEl.textContent = 'Player 2 — HotSeat';
          _timers.push(window.setTimeout(() => {
            el.style.display = 'none';
            _playing = false;
            onDone();
          }, 450));
        }
      }
      step();
    },

    dispose(): void {
      _clear();
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}
