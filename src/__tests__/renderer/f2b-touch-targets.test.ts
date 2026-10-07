/**
 * Phase 1 F-2b — touch-target constants / tutorial dismiss.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FINE_ADJUST_TRACK_H,
  FINE_ADJUST_THUMB_H,
} from '../../renderer/fine-adjust-bar-ui';
import { createTutorialOverlay } from '../../renderer/tutorial-overlay';

describe('Phase 1 F-2b touch targets', () => {
  it('F-2b-1: fine-adjust TRACK_H/THUMB_H are 44', () => {
    expect(FINE_ADJUST_TRACK_H).toBe(44);
    expect(FINE_ADJUST_THUMB_H).toBe(44);
  });

  describe('F-2b-2 tutorial dismiss', () => {
    let root: HTMLElement;
    beforeEach(() => {
      root = document.createElement('div');
      document.body.appendChild(root);
    });
    afterEach(() => {
      root.remove();
    });

    it('close button has min 44×44', () => {
      const tut = createTutorialOverlay(root);
      // Force show so button is in DOM (create always mounts pill)
      const btn = root.querySelector('button[aria-label="Dismiss tutorial"]') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      tut.dispose();
    });
  });
});
