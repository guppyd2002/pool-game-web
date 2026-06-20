/**
 * P1-T02: PowerBar — HTML overlay showing shot power (0–100%).
 *
 * Colour: green → red as power increases (green=light tap, red=full force).
 * Positioned at bottom-centre of the canvas container.
 * DOM-only, no physics dependency.
 */

export interface PowerBarVisual {
  /** Update bar to fraction [0, 1]. 0 hides the bar. */
  update(fraction: number): void;
  /** CUE-021: outer container element for opacity fade. */
  readonly element: HTMLElement;
  dispose(): void;
}

export function createPowerBar(container: HTMLElement): PowerBarVisual {
  const outer = document.createElement('div');
  outer.style.cssText = [
    'position:absolute', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
    'width:200px', 'height:12px', 'background:rgba(0,0,0,0.4)',
    'border-radius:6px', 'overflow:hidden', 'pointer-events:none',
    'opacity:0', 'transition:opacity 0.1s',
  ].join(';');

  const inner = document.createElement('div');
  inner.style.cssText = 'height:100%;width:0%;border-radius:6px;';
  outer.appendChild(inner);
  container.style.position = 'relative';
  container.appendChild(outer);

  return {
    get element() { return outer; },

    update(fraction: number): void {
      const pct = Math.round(Math.max(0, Math.min(fraction, 1)) * 100);
      inner.style.width = `${pct}%`;
      // Green (low) → yellow → red (full)
      const r = Math.round(255 * Math.min(fraction * 2, 1));
      const g = Math.round(255 * Math.min((1 - fraction) * 2, 1));
      inner.style.background = `rgb(${r},${g},0)`;
      outer.style.opacity = fraction > 0 ? '1' : '0';
    },

    dispose(): void {
      container.removeChild(outer);
    },
  };
}
