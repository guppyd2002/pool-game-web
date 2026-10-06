/**
 * Phase 1 / 0-A layout probe — independent page (layout-probe.html).
 * Shows viewport/box/buffer metrics + C4 felt red box from computeFeltScreenRect.
 * CEO screenshots this page; no console required.
 */
import * as THREE from 'three';
import { createScene } from './renderer/scene';
import { computeFeltScreenRect } from './layout/felt-geometry';
import { installSafeAreaCssVars } from './renderer/safe-area';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(digits);
}

function ratio(a: number, b: number): string {
  if (!b) return '—';
  return (a / b).toFixed(5);
}

async function main(): Promise<void> {
  installSafeAreaCssVars();
  const app = $('app');
  const metricsEl = $('metrics');

  const scene = await createScene(app);
  scene.setOrthoTop(true);

  const overlay = document.createElement('div');
  overlay.id = 'felt-overlay';
  const label = document.createElement('div');
  label.id = 'felt-label';
  label.textContent = 'C4 felt (formula)';
  overlay.appendChild(label);
  app.style.position = 'relative';
  app.appendChild(overlay);

  const canvas = scene.renderer.domElement;
  const sizeScratch = new THREE.Vector2();

  const paint = (): void => {
    scene.render();

    const vv = window.visualViewport;
    const appRect = app.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const felt = computeFeltScreenRect(canvasRect.width, canvasRect.height);

    overlay.style.left = `${felt.left + (canvasRect.left - appRect.left)}px`;
    overlay.style.top = `${felt.top + (canvasRect.top - appRect.top)}px`;
    overlay.style.width = `${felt.width}px`;
    overlay.style.height = `${felt.height}px`;

    const root = document.documentElement.style;
    root.setProperty('--felt-left', `${felt.left}px`);
    root.setProperty('--felt-top', `${felt.top}px`);
    root.setProperty('--felt-right', `${felt.gutterRight}px`);
    root.setProperty('--felt-bottom', `${felt.gutterBottom}px`);
    root.setProperty('--felt-width', `${felt.width}px`);
    root.setProperty('--felt-height', `${felt.height}px`);
    root.setProperty('--gutter-left', `${felt.gutterLeft}px`);
    root.setProperty('--gutter-right', `${felt.gutterRight}px`);
    root.setProperty('--gutter-top', `${felt.gutterTop}px`);
    root.setProperty('--gutter-bottom', `${felt.gutterBottom}px`);

    const dpr = window.devicePixelRatio;
    const c1buf = canvas.width / Math.max(1, canvas.height);
    const c1css = canvasRect.width / Math.max(1, canvasRect.height);
    const c1ok = Math.abs(c1buf - c1css) < 0.01;
    const c2app = appRect.height;
    const c2vv = vv?.height ?? null;
    const c2delta = c2vv != null ? c2app - c2vv : null;
    const c3expect = Math.round(canvasRect.width * dpr);
    const c3ok = Math.abs(canvas.width - c3expect) <= 1;

    scene.renderer.getSize(sizeScratch);
    const sa = getComputedStyle(document.documentElement);

    const lines: string[] = [];
    lines.push(`0-A LAYOUT PROBE  ${new Date().toISOString()}`);
    lines.push(`page: ${location.href}`);
    lines.push(`UA: ${navigator.userAgent}`);
    lines.push(
      `standalone: ${window.matchMedia('(display-mode: standalone)').matches}  orientation: ${(screen.orientation && screen.orientation.type) || '—'}`,
    );
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
    lines.push(`renderer.getPixelRatio() ${scene.renderer.getPixelRatio()}`);
    lines.push(`renderer.getSize ${fmt(sizeScratch.x)} × ${fmt(sizeScratch.y)}`);
    lines.push('');
    lines.push('── safe-area CSS vars ──');
    lines.push(
      `--sa-* T/B/L/R   ${sa.getPropertyValue('--sa-top').trim() || '0'} / ${sa.getPropertyValue('--sa-bottom').trim() || '0'} / ${sa.getPropertyValue('--sa-left').trim() || '0'} / ${sa.getPropertyValue('--sa-right').trim() || '0'}`,
    );
    lines.push('');
    lines.push('── C4 felt (formula) — RED BOX ──');
    lines.push(
      `felt rect        ${fmt(felt.width)} × ${fmt(felt.height)} @ (${fmt(felt.left)},${fmt(felt.top)})`,
    );
    lines.push(
      `felt frac        W=${fmt(felt.widthFrac * 100, 1)}%  H=${fmt(felt.heightFrac * 100, 1)}%`,
    );
    lines.push(
      `gutters L/R/T/B  ${fmt(felt.gutterLeft)} / ${fmt(felt.gutterRight)} / ${fmt(felt.gutterTop)} / ${fmt(felt.gutterBottom)}`,
    );
    lines.push('Screenshot check: does the RED box hug the green felt edge?');
    lines.push('');
    lines.push('── decisive compares ──');
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

    metricsEl.textContent = lines.join('\n');
  };

  const loop = (): void => {
    paint();
    requestAnimationFrame(loop);
  };
  loop();

  window.addEventListener('resize', paint);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', paint);
  vv?.addEventListener('scroll', paint);
}

main().catch((err) => {
  const el = document.getElementById('metrics');
  if (el) el.textContent = `Layout probe failed:\n${String(err)}`;
  console.error(err);
});
