/**
 * UI-018 — score / pocket point fly animation (P1-T07).
 * C# PointAnimationUI: point icon flies from table toward score HUD.
 * P1: lightweight CSS translate of "+1" text toward player panel.
 */

export interface PointFlyUI {
  /**
   * Animate a label from table center toward P1 (left) or P2 (right) HUD.
   * @param playerIndex 0 = left/P1, 1 = right/P2
   * @param text default "+1"
   */
  fly(playerIndex: 0 | 1, text?: string): void;
  dispose(): void;
}

export function createPointFlyUI(container: HTMLElement): PointFlyUI {
  const root = document.createElement('div');
  root.id = 'point-fly-layer';
  root.style.cssText = [
    'position:absolute', 'inset:0',
    'pointer-events:none', 'z-index:180',
    'overflow:hidden',
  ].join(';');
  container.appendChild(root);

  return {
    fly(playerIndex, text = '+1'): void {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = [
        'position:absolute',
        'left:50%', 'top:55%',
        'transform:translate(-50%,-50%)',
        'font-family:sans-serif', 'font-weight:800',
        'font-size:28px', 'color:#ffd54f',
        'text-shadow:0 2px 8px rgba(0,0,0,0.7)',
        'transition:transform 0.7s ease-out, opacity 0.7s ease-out',
        'opacity:1',
      ].join(';');
      root.appendChild(el);
      // Force reflow then fly toward player HUD corners
      el.offsetHeight;
      const dx = playerIndex === 0 ? '-42vw' : '42vw';
      const dy = '-42vh';
      el.style.transform = `translate(calc(-50% + ${dx}), calc(-50% + ${dy})) scale(0.6)`;
      el.style.opacity = '0';
      window.setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 750);
    },

    dispose(): void {
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
