/**
 * SP-Harden-6: 大小花進球狀況 HUD — 7 slots per player.
 *
 * Unity authority: BallPool8PlayerUI.cs + PlayerBallPool8GameInfo
 * Spec: digital-twin architecture/features/aim-assist-and-group-hud-spec.md §3
 *
 * Display rules (faithful):
 *   - Fixed 7 slots per player; no reflow
 *   - ballId 0  → empty (pocketed / open-table); hide icon (visibility:hidden, keep slot)
 *   - ballId 8  → black ball (group cleared)
 *   - 1..7      → solid
 *   - 9..15     → stripe
 *   - Group is expressed by which icons fill the row (no text label / no count)
 */

import { BallType } from '../game/player-ball-info';

/** WPA solid colours for slot icons (match ball-materials WPA set). */
const SOLID_HEX: Record<number, string> = {
  1: '#FFD400', 2: '#1E3FAE', 3: '#D62828', 4: '#5B2A86',
  5: '#E8730C', 6: '#1B7B3A', 7: '#7A1F1F',
};

export type SlotKind = 'empty' | 'solid' | 'stripe' | 'black';

export interface SlotVisual {
  readonly kind: SlotKind;
  /** Display number 1-15, or 0 when empty. */
  readonly num: number;
  /** CSS fill colour for the disc body. */
  readonly fill: string;
}

/**
 * Pure mapping: PlayerBallInfo.balls[i] → slot visual state.
 * Unity BallPool8PlayerUI UpdateBalls branch (:348-370).
 */
export function slotVisualFromBallId(ballId: number): SlotVisual {
  if (ballId === 0) return { kind: 'empty', num: 0, fill: 'transparent' };
  if (ballId === 8) return { kind: 'black', num: 8, fill: '#111111' };
  if (ballId >= 9 && ballId <= 15) {
    const solidNum = ballId - 8; // 9→1 … 15→7
    return { kind: 'stripe', num: ballId, fill: SOLID_HEX[solidNum] ?? '#888' };
  }
  if (ballId >= 1 && ballId <= 7) {
    return { kind: 'solid', num: ballId, fill: SOLID_HEX[ballId] ?? '#888' };
  }
  return { kind: 'empty', num: 0, fill: 'transparent' };
}

/**
 * Whether the row is "open table" (type not assigned → all zeros).
 * Unity: CurrentBallType==Non, Balls all 0 → show 7 empty slots.
 */
export function isOpenTableRow(balls: readonly number[]): boolean {
  return balls.length === 7 && balls.every((b) => b === 0);
}

export interface PlayerBallHud {
  /** Refresh both players' 7-slot rows from rule-engine player.balls. */
  update(
    player0Balls: readonly number[],
    player1Balls: readonly number[],
    player0Type?: BallType,
    player1Type?: BallType,
  ): void;
  setVisible(visible: boolean): void;
  readonly element: HTMLElement;
  dispose(): void;
}

function _paintSlot(el: HTMLElement, ballId: number): void {
  const v = slotVisualFromBallId(ballId);
  if (v.kind === 'empty') {
    // Hide icon, keep layout slot (no reflow) — Unity SetEmpty
    el.style.visibility = 'hidden';
    el.textContent = '';
    el.style.background = 'transparent';
    el.style.border = '1px solid transparent';
    return;
  }
  el.style.visibility = 'visible';
  el.style.border = '1px solid rgba(255,255,255,0.35)';
  el.textContent = String(v.num);
  if (v.kind === 'stripe') {
    // White body + colour equatorial band via linear-gradient
    el.style.background = `linear-gradient(180deg, #f0f0e8 0%, #f0f0e8 28%, ${v.fill} 28%, ${v.fill} 72%, #f0f0e8 72%, #f0f0e8 100%)`;
    el.style.color = '#111';
  } else if (v.kind === 'black') {
    el.style.background = v.fill;
    el.style.color = '#fff';
  } else {
    el.style.background = v.fill;
    el.style.color = ballId === 1 || ballId === 9 ? '#111' : '#fff';
  }
}

function _makeSlot(): HTMLElement {
  const s = document.createElement('div');
  s.style.cssText = [
    'width:18px', 'height:18px', 'border-radius:50%',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:9px', 'font-weight:bold', 'font-family:sans-serif',
    'flex:0 0 auto', 'line-height:1',
    'box-sizing:border-box',
  ].join(';');
  s.style.visibility = 'hidden';
  return s;
}

function _makeRow(label: string): { row: HTMLElement; slots: HTMLElement[] } {
  const row = document.createElement('div');
  row.style.cssText = [
    'display:flex', 'align-items:center', 'gap:3px',
    'flex:0 0 auto',
  ].join(';');
  const name = document.createElement('span');
  name.textContent = label;
  name.style.cssText = 'font-size:10px;font-weight:bold;opacity:0.85;margin-right:2px;min-width:18px;';
  row.appendChild(name);
  const slots: HTMLElement[] = [];
  for (let i = 0; i < 7; i++) {
    const s = _makeSlot();
    slots.push(s);
    row.appendChild(s);
  }
  return { row, slots };
}

/**
 * Build dual 7-slot rows. Prefer placing under the main HUD strip.
 * Container is absolute, just below the 36px HUD bar.
 */
export function createPlayerBallHud(container: HTMLElement): PlayerBallHud {
  const wrap = document.createElement('div');
  wrap.id = 'player-ball-hud';
  wrap.style.cssText = [
    'position:absolute',
    'top:calc(36px + env(safe-area-inset-top, 0px))',
    'left:0', 'right:0',
    'padding:4px 8px',
    'padding-left:max(8px, env(safe-area-inset-left, 0px))',
    'padding-right:max(8px, env(safe-area-inset-right, 0px))',
    'display:flex', 'justify-content:space-between', 'align-items:center',
    'background:rgba(0,0,0,0.55)',
    'z-index:199',
    'pointer-events:none', // never block canvas aim
    'font-family:sans-serif', 'color:#fff',
  ].join(';');

  const left = _makeRow('P1');
  const right = _makeRow('P2');
  wrap.appendChild(left.row);
  wrap.appendChild(right.row);
  container.appendChild(wrap);

  function _apply(slots: HTMLElement[], balls: readonly number[]): void {
    for (let i = 0; i < 7; i++) {
      _paintSlot(slots[i], balls[i] ?? 0);
    }
  }

  return {
    get element() { return wrap; },

    update(p0, p1, _t0?, _t1?): void {
      // Open table: all zeros → 7 hidden slots (layout kept)
      _apply(left.slots, p0.length === 7 ? p0 : [0, 0, 0, 0, 0, 0, 0]);
      _apply(right.slots, p1.length === 7 ? p1 : [0, 0, 0, 0, 0, 0, 0]);
    },

    setVisible(visible: boolean): void {
      wrap.style.display = visible ? 'flex' : 'none';
    },

    dispose(): void {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    },
  };
}
