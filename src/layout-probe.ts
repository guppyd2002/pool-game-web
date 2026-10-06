/**
 * Phase 1 / 0-A layout probe — independent page (layout-probe.html).
 * Shows viewport/box/buffer metrics + C4 felt red box from computeFeltScreenRect.
 * CEO screenshots this page; no console required.
 *
 * CTO C2 (PR #5 gate): metrics table MUST paint before PoolTable.glb finishes.
 * C1/C2/C3 are DOM/viewport-only; C4 red box attaches after createScene.
 */
import * as THREE from 'three';
import { createScene, type SceneAPI } from './renderer/scene';
import { computeFeltScreenRect } from './layout/felt-geometry';
import { applyFeltCssVars } from './layout/felt-css-vars';
import { formatDomMetrics, fmt } from './layout/probe-metrics';
import { installSafeAreaCssVars } from './renderer/safe-area';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

async function main(): Promise<void> {
  installSafeAreaCssVars();
  const app = $('app');
  const metricsEl = $('metrics');
  app.style.position = 'relative';

  // ── Immediate paint (before any await / GLB) — CTO C2 ─────────────────
  let sceneStatus = 'scene/GLB: loading…';
  const paintDomOnly = (): void => {
    metricsEl.textContent = formatDomMetrics({ app, status: sceneStatus });
  };
  paintDomOnly();

  let preRaf = 0;
  const preLoop = (): void => {
    paintDomOnly();
    preRaf = requestAnimationFrame(preLoop);
  };
  preRaf = requestAnimationFrame(preLoop);

  window.addEventListener('resize', paintDomOnly);
  const vv = window.visualViewport;
  vv?.addEventListener('resize', paintDomOnly);
  vv?.addEventListener('scroll', paintDomOnly);

  let scene: SceneAPI;
  try {
    scene = await createScene(app);
  } catch (err) {
    cancelAnimationFrame(preRaf);
    sceneStatus = `scene/GLB: FAILED — ${String(err)}`;
    paintDomOnly();
    throw err;
  }

  cancelAnimationFrame(preRaf);
  sceneStatus = 'scene/GLB: ready (ortho top)';
  scene.setOrthoTop(true);

  const overlay = document.createElement('div');
  overlay.id = 'felt-overlay';
  const label = document.createElement('div');
  label.id = 'felt-label';
  label.textContent = 'C4 felt (formula)';
  overlay.appendChild(label);
  app.appendChild(overlay);

  const canvas = scene.renderer.domElement;
  const sizeScratch = new THREE.Vector2();

  const paint = (): void => {
    scene.render();

    const appRect = app.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const felt = computeFeltScreenRect(canvasRect.width, canvasRect.height);

    overlay.style.left = `${felt.left + (canvasRect.left - appRect.left)}px`;
    overlay.style.top = `${felt.top + (canvasRect.top - appRect.top)}px`;
    overlay.style.width = `${felt.width}px`;
    overlay.style.height = `${felt.height}px`;

    const { invariant } = applyFeltCssVars(app, canvasRect.width, canvasRect.height);

    const feltLine = [
      '── C4 felt (formula) — RED BOX ──',
      `felt rect        ${fmt(felt.width)} × ${fmt(felt.height)} @ (${fmt(felt.left)},${fmt(felt.top)})`,
      `felt frac        W=${fmt(felt.widthFrac * 100, 1)}%  H=${fmt(felt.heightFrac * 100, 1)}%`,
      `gutters L/R/T/B  ${fmt(felt.gutterLeft)} / ${fmt(felt.gutterRight)} / ${fmt(felt.gutterTop)} / ${fmt(felt.gutterBottom)}`,
      `C4 invariant     ${invariant.ok ? 'OK' : 'RED — ' + invariant.errors.join('; ')}`,
      'Screenshot check: does the RED box hug the green felt edge?',
    ];
    if (invariant.red) {
      metricsEl.style.borderColor = '#f44';
      metricsEl.style.color = '#ffb0b0';
    } else {
      metricsEl.style.borderColor = '#3a3';
      metricsEl.style.color = '#e8ffe8';
    }

    const aniso = scene.getAnisotropyReport();
    const anisoLines = [
      '── #7a A-1′ anisotropy ──',
      `getMaxAnisotropy()  ${aniso.maxAnisotropy}  cap=${aniso.cap}  applied=${aniso.applied}`,
      ...aniso.table.map(
        (t) =>
          `table ${t.slot.padEnd(22)} set=${t.anisotropySet}  effective=${t.anisotropyEffective}`,
      ),
      ...(aniso.table.length === 0 ? ['table (no maps found)'] : []),
      ...aniso.ball.map(
        (t) =>
          `ball  ${t.slot.padEnd(22)} set=${t.anisotropySet}  effective=${t.anisotropyEffective}`,
      ),
      ...(aniso.ball.length === 0
        ? ['ball  (no maps — cue may be untextured; solids use atlas)']
        : []),
      'Note: top-view null delta is predicted; orbit benefits vertical faces.',
    ];

    metricsEl.textContent =
      formatDomMetrics({
        app,
        status: sceneStatus,
        canvas,
        renderer: scene.renderer,
        sizeScratch,
        feltLine,
      }) +
      '\n\n' +
      anisoLines.join('\n');
  };

  // Playwright / CEO A-B hooks
  (window as unknown as { __layoutProbe: unknown }).__layoutProbe = {
    scene,
    getAnisotropyReport: () => scene.getAnisotropyReport(),
    setOrthoTop: (v: boolean) => scene.setOrthoTop(v),
    setOrbitPose: (pos: [number, number, number], lookAt: [number, number, number] = [0, 0, 0]) => {
      scene.setOrthoTop(false);
      scene.camera.position.set(...pos);
      scene.camera.lookAt(...lookAt);
      scene.camera.updateProjectionMatrix();
    },
  };

  const loop = (): void => {
    paint();
    requestAnimationFrame(loop);
  };
  loop();

  window.addEventListener('resize', paint);
  vv?.addEventListener('resize', paint);
  vv?.addEventListener('scroll', paint);
}

main().catch((err) => {
  const el = document.getElementById('metrics');
  if (el) {
    const prev =
      el.textContent && !el.textContent.startsWith('Loading') ? el.textContent : '';
    el.textContent =
      (prev ? prev + '\n\n' : '') + `Layout probe scene failed:\n${String(err)}`;
  }
  console.error(err);
});
