/**
 * SP-Harden-6: pure slot visual mapping for 7-slot group HUD.
 * Unity BallPool8PlayerUI UpdateBalls branch — no DOM.
 */
import { describe, it, expect } from 'vitest';
import {
  slotVisualFromBallId,
  isOpenTableRow,
} from '../../renderer/player-ball-hud';

describe('slotVisualFromBallId', () => {
  it('0 → empty (pocketed / open-table slot)', () => {
    expect(slotVisualFromBallId(0)).toEqual({ kind: 'empty', num: 0, fill: 'transparent' });
  });

  it('8 → black (group cleared)', () => {
    const v = slotVisualFromBallId(8);
    expect(v.kind).toBe('black');
    expect(v.num).toBe(8);
  });

  it('1..7 → solid with WPA fill', () => {
    for (let n = 1; n <= 7; n++) {
      const v = slotVisualFromBallId(n);
      expect(v.kind).toBe('solid');
      expect(v.num).toBe(n);
      expect(v.fill).toMatch(/^#/);
    }
  });

  it('9..15 → stripe (colour from solid twin)', () => {
    for (let n = 9; n <= 15; n++) {
      const v = slotVisualFromBallId(n);
      expect(v.kind).toBe('stripe');
      expect(v.num).toBe(n);
      expect(v.fill).toMatch(/^#/);
    }
  });

  it('solids and matching stripe share fill colour (1 and 9 both yellow)', () => {
    expect(slotVisualFromBallId(1).fill).toBe(slotVisualFromBallId(9).fill);
    expect(slotVisualFromBallId(3).fill).toBe(slotVisualFromBallId(11).fill);
  });
});

describe('isOpenTableRow', () => {
  it('all zeros = open table', () => {
    expect(isOpenTableRow([0, 0, 0, 0, 0, 0, 0])).toBe(true);
  });

  it('setSolids row is not open table', () => {
    expect(isOpenTableRow([1, 2, 3, 4, 5, 6, 7])).toBe(false);
  });

  it('partial pocket (some zeros) is not open table', () => {
    expect(isOpenTableRow([1, 0, 3, 4, 5, 6, 7])).toBe(false);
  });

  it('black-only row after clear is not open table', () => {
    expect(isOpenTableRow([8, 0, 0, 0, 0, 0, 0])).toBe(false);
  });
});
