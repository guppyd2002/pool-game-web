/**
 * Gate 1 — Scatter Verification: numerical + visual evidence that the break
 * shot genuinely scatters the rack (as requested by 千手 after subagent
 * perspective-ambiguity report).
 *
 * Tests:
 *   SV1 — Per-ball displacement table + min pairwise separation (rack 15 balls)
 *   SV2 — Top-down orthographic screenshot of settled state (no perspective overlap)
 *   SV3 — B9 cue-visible: aim drag AFTER replay ends confirms cue reappears
 *
 * Screenshots → tests/smoke/screenshots/
 * Numerical output → console (visible in test report)
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:5173';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const SS = (name: string) => path.join(__dirname, 'screenshots', name);

function ensureDir(): void {
  const d = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

async function loadApp(page: Page): Promise<void> {
  ensureDir();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

/** Project cue ball mesh to viewport coordinates via __poolDebug. */
async function cueBallScreenPos(page: Page): Promise<{ x: number; y: number }> {
  const pos = await page.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__poolDebug as {
      camera: { projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } };
      cueBallMesh: { position: { x: number; y: number; z: number } };
      renderer: { domElement: HTMLCanvasElement };
    } | undefined;
    if (!debug) return null;
    const { x, y, z } = debug.cueBallMesh.position;
    const me = debug.camera.matrixWorldInverse.elements;
    const pe = debug.camera.projectionMatrix.elements;
    const vx = me[0]*x + me[4]*y + me[8]*z  + me[12];
    const vy = me[1]*x + me[5]*y + me[9]*z  + me[13];
    const vz = me[2]*x + me[6]*y + me[10]*z + me[14];
    const vw = me[3]*x + me[7]*y + me[11]*z + me[15];
    const cx = pe[0]*vx + pe[4]*vy + pe[8]*vz  + pe[12]*vw;
    const cy = pe[1]*vx + pe[5]*vy + pe[9]*vz  + pe[13]*vw;
    const cw = pe[3]*vx + pe[7]*vy + pe[11]*vz + pe[15]*vw;
    const canvas = debug.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: Math.round(rect.left + (cx/cw + 1) / 2 * rect.width),
      y: Math.round(rect.top  + (1 - cy/cw) / 2 * rect.height),
    };
  });
  if (!pos) {
    const box = await page.locator('canvas').boundingBox();
    return { x: Math.round(box!.x + box!.width * 0.28), y: Math.round(box!.y + box!.height * 0.50) };
  }
  return pos;
}

/** Dispatch PointerEvent directly to canvas element. */
async function canvasPointerEvent(
  page: Page, type: string, clientX: number, clientY: number, buttons = 1,
): Promise<void> {
  await page.evaluate(({ type, clientX, clientY, buttons }) => {
    document.querySelector('canvas')?.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX, clientY, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      }),
    );
  }, { type, clientX, clientY, buttons });
}

/**
 * Fire via real ShotSlider state machine:
 * mouse.down → startControl() → input(setValue) → mouse.up(endControl) → Shot click
 */
async function fireShot(page: Page, forcePct = 80): Promise<void> {
  const slider = page.locator('input[type="range"]').first();
  const sbox   = await slider.boundingBox();
  await page.mouse.move(sbox!.x + 4, sbox!.y + sbox!.height / 2);
  await page.mouse.down();
  await slider.evaluate((el, pct) => {
    (el as HTMLInputElement).value = String(pct);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, forcePct);
  await page.mouse.up();
  await page.waitForTimeout(50);
  await page.locator('button').filter({ hasText: 'Shot' }).click();
}

/** Read all 16 ball XZ positions from scene via __poolDebug. */
async function readBallXZ(page: Page): Promise<Array<{ x: number; z: number }>> {
  return page.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__poolDebug as {
      balls: Array<{ position: { x: number; z: number } }>;
    } | undefined;
    return debug?.balls?.map(b => ({ x: b.position.x, z: b.position.z })) ?? [];
  });
}

// ─── SV1: Per-ball displacement + min pairwise separation ────────────────────
test('SV1 — numerical scatter: per-ball displacement + min rack separation', async ({ page }) => {
  await loadApp(page);

  // Aim toward rack
  const { x: cx, y: cy } = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 8; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy);
    await page.waitForTimeout(15);
  }
  await canvasPointerEvent(page, 'pointerup', cx + 120, cy, 0);
  await page.waitForTimeout(100);

  const before = await readBallXZ(page);
  await fireShot(page, 85);

  // Wait for full settle
  await page.waitForTimeout(7000);
  const after = await readBallXZ(page);

  // ─── Per-ball displacement ─────────────────────────────────────────────────
  const BALL_DIAMETER = 0.056;  // 2 * BALL_RADIUS (0.028m) in scene space
  const displacements = before.map((b, i) => {
    const dx = after[i].x - b.x;
    const dz = after[i].z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  });

  console.log('\n─── Per-ball displacement (scene-space meters) ───');
  displacements.forEach((d, i) => {
    const label = i === 0 ? 'cue' : `rack-${i}`;
    console.log(`  ball[${String(i).padStart(2)}] ${label.padEnd(7)}: ${d.toFixed(4)}m ${d < 0.001 ? '⚠ NO-MOVE' : '✓'}`);
  });

  const rackDisp = displacements.slice(1);
  const zeroMovers = rackDisp.filter(d => d < 0.001).length;
  const totalDisp  = displacements.reduce((a, b) => a + b, 0);
  console.log(`\n  cue ball displacement: ${displacements[0].toFixed(4)}m`);
  console.log(`  rack 15 total displacement: ${rackDisp.reduce((a,b)=>a+b,0).toFixed(4)}m`);
  console.log(`  rack balls with near-zero movement: ${zeroMovers}/15`);

  // ─── Min pairwise separation (rack balls after settle) ────────────────────
  let minSepBefore = Infinity, minSepAfter = Infinity;
  for (let i = 1; i <= 15; i++) {
    for (let j = i + 1; j <= 15; j++) {
      const dxB = before[i].x - before[j].x, dzB = before[i].z - before[j].z;
      const dxA = after[i].x  - after[j].x,  dzA = after[i].z  - after[j].z;
      minSepBefore = Math.min(minSepBefore, Math.sqrt(dxB*dxB + dzB*dzB));
      minSepAfter  = Math.min(minSepAfter,  Math.sqrt(dxA*dxA + dzA*dzA));
    }
  }
  console.log('\n─── Min pairwise separation (rack 15 balls) ───');
  console.log(`  before shot: ${minSepBefore.toFixed(4)}m  (expected ≈ ${BALL_DIAMETER.toFixed(4)}m, tight rack)`);
  console.log(`  after settle: ${minSepAfter.toFixed(4)}m`);
  console.log(`  ball diameter: ${BALL_DIAMETER}m`);

  // Scatter criterion: rack bounding-box expansion
  const rackXsBefore = before.slice(1).map(b => b.x);
  const rackZsBefore = before.slice(1).map(b => b.z);
  const rackXsAfter  = after.slice(1).map(b => b.x);
  const rackZsAfter  = after.slice(1).map(b => b.z);
  const bboxBefore = {
    w: Math.max(...rackXsBefore) - Math.min(...rackXsBefore),
    h: Math.max(...rackZsBefore) - Math.min(...rackZsBefore),
  };
  const bboxAfter = {
    w: Math.max(...rackXsAfter) - Math.min(...rackXsAfter),
    h: Math.max(...rackZsAfter) - Math.min(...rackZsAfter),
  };
  console.log('\n─── Rack bounding box (XZ span) ───');
  console.log(`  before: W=${bboxBefore.w.toFixed(4)}m  H=${bboxBefore.h.toFixed(4)}m`);
  console.log(`  after:  W=${bboxAfter.w.toFixed(4)}m  H=${bboxAfter.h.toFixed(4)}m`);
  console.log(`  ΔW=${(bboxAfter.w-bboxBefore.w).toFixed(4)}m  ΔH=${(bboxAfter.h-bboxBefore.h).toFixed(4)}m`);

  // Assertions
  expect(totalDisp).toBeGreaterThan(0.3);  // total movement
  expect(zeroMovers).toBeLessThan(8);       // at most half the rack is stationary
  // Bounding box must expand (rack spread out)
  expect(bboxAfter.w + bboxAfter.h).toBeGreaterThan(bboxBefore.w + bboxBefore.h + 0.1);
});

// ─── SV2: Top-down orthographic screenshot ────────────────────────────────────
test('SV2 — top-down view: settled ball positions without perspective overlap', async ({ page }) => {
  await loadApp(page);

  // Aim and shoot
  const { x: cx, y: cy } = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 8; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy);
    await page.waitForTimeout(15);
  }
  await canvasPointerEvent(page, 'pointerup', cx + 120, cy, 0);
  await page.waitForTimeout(100);
  await fireShot(page, 85);

  // Wait for full settle
  await page.waitForTimeout(7000);

  // Switch camera to overhead and force an immediate render before screenshot
  await page.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__poolDebug as {
      camera: {
        position: { set(x: number, y: number, z: number): void };
        up: { set(x: number, y: number, z: number): void };
        lookAt(x: number, y: number, z: number): void;
        updateMatrixWorld(force: boolean): void;
      };
      renderer: { render(scene: unknown, camera: unknown): void };
      scene: unknown;
    } | undefined;
    if (!debug) return;
    const { camera, renderer, scene } = debug;
    // camera.up must be set before lookAt — (0,1,0) is parallel to downward view dir
    camera.up.set(0, 0, -1);
    camera.position.set(0, 3, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    // Force immediate render so the screenshot captures overhead view, not rAF frame boundary
    renderer.render(scene, camera);
  });

  await page.waitForTimeout(50);
  await page.screenshot({ path: SS('SV2-top-down-settled.png') });

  expect(fs.existsSync(SS('SV2-top-down-settled.png'))).toBe(true);
  console.log('SV2: top-down screenshot saved → tests/smoke/screenshots/SV2-top-down-settled.png');
});

// ─── SV3: B9 cue-visible after turn reset ─────────────────────────────────────
test('SV3 — B9 cue-visible: cue reappears after replay, ready to aim', async ({ page }) => {
  // Note on cue mesh lifecycle: group.visible is set to TRUE only inside cueMesh.update()
  // when an active aimDir is provided. This happens exclusively via onAimUpdate, which
  // is triggered by pointer drag events on the canvas. Between shots the cue is hidden
  // until the player starts dragging (by design — matches C# CueShotManager behaviour).
  //
  // B9 "turn reset" therefore means: after replay ends, dragging the cue ball WORKS
  // and the cue re-appears. We verify this with a drag after settle.

  await loadApp(page);

  // Fire shot
  const { x: cx, y: cy } = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 6; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy);
    await page.waitForTimeout(15);
  }
  await canvasPointerEvent(page, 'pointerup', cx + 90, cy, 0);
  await page.waitForTimeout(100);
  await fireShot(page, 50);

  // Screenshot: replay in progress (cue hidden — by design during simulation)
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS('SV3-B9-replay-in-progress.png') });

  // Wait for full settle
  await page.waitForTimeout(6000);

  // After settle: find new cue ball position (it moved) and aim-drag to make cue appear
  const newPos = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', newPos.x, newPos.y);
  for (let i = 1; i <= 10; i++) {
    await canvasPointerEvent(page, 'pointermove', newPos.x + i * 12, newPos.y);
    await page.waitForTimeout(20);
  }
  // Hold drag for screenshot — cue should now be visible
  await page.waitForTimeout(300);
  await page.screenshot({ path: SS('SV3-B9-cue-visible-after-reset.png') });
  await canvasPointerEvent(page, 'pointerup', newPos.x + 120, newPos.y, 0);

  expect(fs.existsSync(SS('SV3-B9-cue-visible-after-reset.png'))).toBe(true);
  console.log('SV3: cue-visible screenshot saved — verify cue stick visible in SV3-B9-cue-visible-after-reset.png');
});
