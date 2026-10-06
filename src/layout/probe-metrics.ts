/**
 * Phase 1 / 0-A — DOM/viewport metrics formatter (no WebGL / no GLB).
 * Used by layout-probe so the numbers table can paint before createScene (CTO C2).
 */
import type * as THREE from 'three';

export function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(digits);
}

export function ratio(a: number, b: number): string {
  if (!b) return '—';
  return (a / b).toFixed(5);
}

/** DOM/viewport metrics — no WebGL / no GLB required (CTO C2). */
export function formatDomMetrics(opts: {
  app: HTMLElement;
  status: string;
  canvas?: HTMLCanvasElement | null;
  renderer?: THREE.WebGLRenderer | null;
  sizeScratch?: THREE.Vector2;
  feltLine?: string[];
}): string {
  const { app, status, canvas, renderer, sizeScratch, feltLine } = opts;
  const vv = window.visualViewport;
  const appRect = app.getBoundingClientRect();
  const dpr = window.devicePixelRatio;
  const sa = getComputedStyle(document.documentElement);

  const lines: string[] = [];
  lines.push(`0-A LAYOUT PROBE  ${new Date().toISOString()}`);
  lines.push(`page: ${location.href}`);
  lines.push(`UA: ${navigator.userAgent}`);
  lines.push(
    `standalone: ${window.matchMedia('(display-mode: standalone)').matches}  orientation: ${(screen.orientation && screen.orientation.type) || '—'}`,
  );
  lines.push(`status: ${status}`);
  lines.push('');
  lines.push('── viewport ──');
  lines.push(`screen           ${screen.width} × ${screen.height}`);
  lines.push(`inner            ${window.innerWidth} × ${window.innerHeight}`);
  lines.push(
    `visualViewport   ${fmt(vv?.width)} × ${fmt(vv?.height)}  offset(${fmt(vv?.offsetLeft)},${fmt(vv?.offsetTop)}) scale=${fmt(vv?.scale, 3)}`,
  );
  lines.push(
    `docElement       ${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`,
  );
  lines.push(`devicePixelRatio ${dpr}`);
  lines.push('');
  lines.push('── box ──');
  lines.push(
    `#app rect        ${fmt(appRect.width)} × ${fmt(appRect.height)} @ (${fmt(appRect.left)},${fmt(appRect.top)})`,
  );

  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect();
    lines.push(
      `canvas rect      ${fmt(canvasRect.width)} × ${fmt(canvasRect.height)} @ (${fmt(canvasRect.left)},${fmt(canvasRect.top)})`,
    );
    lines.push(
      `canvas computed  ${getComputedStyle(canvas).width} × ${getComputedStyle(canvas).height}`,
    );
    lines.push('');
    lines.push('── buffer ──');
    lines.push(
      `canvas buffer    ${canvas.width} × ${canvas.height}  ratio=${ratio(canvas.width, canvas.height)}`,
    );
    if (renderer) {
      lines.push(`renderer.getPixelRatio() ${renderer.getPixelRatio()}`);
      if (sizeScratch) {
        renderer.getSize(sizeScratch);
        lines.push(`renderer.getSize ${fmt(sizeScratch.x)} × ${fmt(sizeScratch.y)}`);
      }
    }
  } else {
    lines.push('canvas rect      (pending — scene/GLB loading)');
    lines.push('');
    lines.push('── buffer ──');
    const expectW = Math.round(appRect.width * dpr);
    const expectH = Math.round(appRect.height * dpr);
    lines.push(
      `canvas buffer    (pending)  #app×dpr expect ~${expectW} × ${expectH}`,
    );
  }

  lines.push('');
  lines.push('── safe-area CSS vars ──');
  lines.push(
    `--sa-* T/B/L/R   ${sa.getPropertyValue('--sa-top').trim() || '0'} / ${sa.getPropertyValue('--sa-bottom').trim() || '0'} / ${sa.getPropertyValue('--sa-left').trim() || '0'} / ${sa.getPropertyValue('--sa-right').trim() || '0'}`,
  );

  if (feltLine && feltLine.length) {
    lines.push('');
    for (const L of feltLine) lines.push(L);
  } else {
    lines.push('');
    lines.push('── C4 felt (formula) — RED BOX ──');
    lines.push('(pending — waiting for scene/GLB; metrics above are live)');
  }

  const c2app = appRect.height;
  const c2vv = vv?.height ?? null;
  const c2delta = c2vv != null ? c2app - c2vv : null;
  lines.push('');
  lines.push('── decisive compares ──');
  if (canvas) {
    const canvasRect = canvas.getBoundingClientRect();
    const c1buf = canvas.width / Math.max(1, canvas.height);
    const c1css = canvasRect.width / Math.max(1, canvasRect.height);
    const c1ok = Math.abs(c1buf - c1css) < 0.01;
    const c3expect = Math.round(canvasRect.width * dpr);
    const c3ok = Math.abs(canvas.width - c3expect) <= 1;
    lines.push(
      `C1 buffer/css aspect  ${fmt(c1buf, 5)} vs ${fmt(c1css, 5)}  → ${c1ok ? 'MATCH (not H2)' : 'MISMATCH → H2?'}`,
    );
    lines.push(
      `C2 #app.h vs vv.h     ${fmt(c2app)} vs ${fmt(c2vv)}  Δ=${fmt(c2delta)}  → ${c2delta != null && Math.abs(c2delta) > 2 ? 'H1?' : 'ok/unknown'}`,
    );
    lines.push(
      `C3 buffer vs rect×dpr ${canvas.width} vs ~${c3expect}  → ${c3ok ? 'MATCH' : 'MISMATCH'}`,
    );
    lines.push('C4 felt formula box   see RED overlay (visual)');
  } else {
    lines.push('C1 buffer/css aspect  (pending canvas)');
    lines.push(
      `C2 #app.h vs vv.h     ${fmt(c2app)} vs ${fmt(c2vv)}  Δ=${fmt(c2delta)}  → ${c2delta != null && Math.abs(c2delta) > 2 ? 'H1?' : 'ok/unknown'}`,
    );
    lines.push('C3 buffer vs rect×dpr (pending canvas)');
    lines.push('C4 felt formula box   (pending scene)');
  }

  return lines.join('\n');
}
