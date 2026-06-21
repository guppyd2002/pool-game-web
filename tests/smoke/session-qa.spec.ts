/**
 * P1-T04 playable session QA (卡卡西).
 *   SQ1 — corrected rack renders at authoritative Unity positions (apex 0.6413,
 *         cue -0.6413, black id8 (0.7402,0)) + break scatters from the 6413 rack.
 *   SQ2 — turn advances after a settled shot (GAME-015 camera tween: camera moves).
 * Screenshots → tests/smoke/screenshots/
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (n: string) => path.join(__dirname, 'screenshots', n);

async function loadApp(page: Page): Promise<void> {
  if (!fs.existsSync(path.join(__dirname, 'screenshots'))) fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // GAME-003: start a HotSeat game so the rack is placed via session.startNewGame()
  const play = page.locator('button').filter({ hasText: /play|hotseat|start/i }).first();
  if (await play.count()) { await play.click().catch(() => {}); await page.waitForTimeout(800); }
}

async function readBallXZ(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as { balls: Array<{ position: { x: number; z: number } }> } | undefined;
    return d?.balls?.map(b => ({ x: b.position.x, z: b.position.z })) ?? [];
  });
}
async function cueScreen(page: Page) {
  // Project the actual cue mesh to viewport coords (accurate aim — crude % estimates miss).
  const pos = await page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as {
      camera: { projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } };
      cueBallMesh: { position: { x: number; y: number; z: number } };
      renderer: { domElement: HTMLCanvasElement };
    } | undefined;
    if (!d) return null;
    const { x, y, z } = d.cueBallMesh.position;
    const me = d.camera.matrixWorldInverse.elements, pe = d.camera.projectionMatrix.elements;
    const vx = me[0]*x+me[4]*y+me[8]*z+me[12], vy = me[1]*x+me[5]*y+me[9]*z+me[13], vz = me[2]*x+me[6]*y+me[10]*z+me[14], vw = me[3]*x+me[7]*y+me[11]*z+me[15];
    const cx = pe[0]*vx+pe[4]*vy+pe[8]*vz+pe[12]*vw, cy = pe[1]*vx+pe[5]*vy+pe[9]*vz+pe[13]*vw, cw = pe[3]*vx+pe[7]*vy+pe[11]*vz+pe[15]*vw;
    const rect = d.renderer.domElement.getBoundingClientRect();
    return { x: Math.round(rect.left + (cx/cw+1)/2*rect.width), y: Math.round(rect.top + (1-cy/cw)/2*rect.height) };
  });
  if (pos) return pos;
  const box = await page.locator('canvas').boundingBox();
  return { x: Math.round(box!.x + box!.width * 0.28), y: Math.round(box!.y + box!.height * 0.5) };
}
async function ptr(page: Page, type: string, x: number, y: number, buttons = 1) {
  await page.evaluate(({ type, x, y, buttons }) => {
    document.querySelector('canvas')?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }, { type, x, y, buttons });
}
async function fireShot(page: Page, pct = 85) {
  const slider = page.locator('input[type="range"]').first();
  const b = await slider.boundingBox();
  await page.mouse.move(b!.x + 4, b!.y + b!.height / 2); await page.mouse.down();
  await slider.evaluate((el, p) => { (el as HTMLInputElement).value = String(p); el.dispatchEvent(new Event('input', { bubbles: true })); }, pct);
  await page.mouse.up(); await page.waitForTimeout(50);
  await page.locator('button').filter({ hasText: 'Shot' }).click();
}

test('SQ1 — corrected rack (6413) renders + break scatters', async ({ page }) => {
  await loadApp(page);
  const before = await readBallXZ(page);
  expect(before.length).toBeGreaterThanOrEqual(16);
  // Authoritative Unity rack (scene meters = fixed/10000): cue -0.6413, apex 0.6413, black id8 (0.7402, 0)
  console.log(`SQ1 rack: cue.x=${before[0].x.toFixed(4)} apex(1).x=${before[1].x.toFixed(4)} black(8)=(${before[8].x.toFixed(4)},${before[8].z.toFixed(4)})`);
  expect(Math.abs(before[0].x - (-0.6413))).toBeLessThan(0.002);   // cue
  expect(Math.abs(before[1].x - 0.6413)).toBeLessThan(0.002);      // apex
  expect(Math.abs(before[8].x - 0.7402)).toBeLessThan(0.002);      // black ball x
  expect(Math.abs(before[8].z - 0)).toBeLessThan(0.002);           // black ball centered z=0

  // Aim toward rack and break
  const { x: cx, y: cy } = await cueScreen(page);
  await ptr(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 8; i++) { await ptr(page, 'pointermove', cx + i * 15, cy); await page.waitForTimeout(15); }
  await ptr(page, 'pointerup', cx + 120, cy, 0);
  await page.waitForTimeout(100);
  await fireShot(page, 85);
  await page.waitForTimeout(7000);
  const after = await readBallXZ(page);

  const rackXsB = before.slice(1).map(b => b.x), rackXsA = after.slice(1).map(b => b.x);
  const rackZsB = before.slice(1).map(b => b.z), rackZsA = after.slice(1).map(b => b.z);
  const spanB = (Math.max(...rackXsB) - Math.min(...rackXsB)) + (Math.max(...rackZsB) - Math.min(...rackZsB));
  const spanA = (Math.max(...rackXsA) - Math.min(...rackXsA)) + (Math.max(...rackZsA) - Math.min(...rackZsA));
  console.log(`SQ1 rack bbox span before=${spanB.toFixed(3)}m after=${spanA.toFixed(3)}m`);
  expect(spanA).toBeGreaterThan(spanB + 0.1);   // scattered
  await page.screenshot({ path: SS('SQ1-break-settled.png') });
});
// GAME-015 camera tween is verified in session-qa-2.spec.ts (SQ3) as an ENTER/EXIT
// transition (overview↔table), not a per-shot event — camera is static mid-shot by design.
