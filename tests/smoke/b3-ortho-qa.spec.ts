/**
 * B3 strict orthographic top-down camera ratify (卡卡西). Captures 4 screenshots for
 * visual verification (analysed by subagent), plus programmatic restore check.
 *   B3-1 perspective (play view)
 *   B3-2 ortho top-down (whole table + ≥15% margin, no distortion)
 *   B3-3 ortho + aim drag (aim line points cue→rack, raycast works in ortho)
 *   B3-4 restored perspective (POSE_TABLE, no residual ortho)
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (n: string) => path.join(__dirname, 'screenshots', n);

async function goto(page: Page) {
  if (!fs.existsSync(path.join(__dirname, 'screenshots'))) fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}
async function clickPlay(page: Page) {
  const play = page.locator('button').filter({ hasText: /play|hotseat|start/i }).first();
  if (await play.count()) { await play.click().catch(() => {}); await page.waitForTimeout(900); }
}
async function perspCam(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as { camera: { position: { x: number; y: number; z: number }; type: string } } | undefined;
    const p = d?.camera.position; return p ? { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), type: d!.camera.type } : null;
  });
}
// Ortho top-down screen position of a world (x,z): cam (0,5,0), up=(0,0,-1) → screen-right=+X, screen-up=-Z.
async function orthoScreen(page: Page, wx: number, wz: number) {
  return page.evaluate(({ wx, wz }) => {
    const canvas = document.querySelector('canvas')!; const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const HX = (2.54 / 2) * 1.15, HZ = (1.27 / 2) * 1.15, tableAspect = HX / HZ;
    const hw = aspect >= tableAspect ? HZ * aspect : HX;
    const hh = aspect >= tableAspect ? HZ : HX / aspect;
    const ndcx = wx / hw, ndcy = (-wz) / hh;
    return { x: Math.round(rect.left + (ndcx + 1) / 2 * rect.width), y: Math.round(rect.top + (1 - ndcy) / 2 * rect.height) };
  }, { wx, wz });
}
async function ptr(page: Page, type: string, x: number, y: number, buttons = 1) {
  await page.evaluate(({ type, x, y, buttons }) => { document.querySelector('canvas')?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true })); }, { type, x, y, buttons });
}

test('B3 — ortho top-down: 4-state screenshot ratify + restore check', async ({ page }) => {
  await goto(page); await clickPlay(page);

  // 1) perspective baseline
  const persp0 = await perspCam(page);
  await page.screenshot({ path: SS('B3-1-perspective.png') });

  // 2) toggle ortho via 'T'
  await page.keyboard.press('t');
  await page.waitForTimeout(700);
  await page.screenshot({ path: SS('B3-2-ortho.png') });
  // perspective camera must NOT have moved (ortho is a separate camera)
  const perspDuringOrtho = await perspCam(page);

  // 3) aim drag in ortho: cue ball (-0.6413,0) → toward rack (+x). Drag rightward.
  const cue = await orthoScreen(page, -0.6413, 0);
  const aimTarget = await orthoScreen(page, 0.2, 0);   // a point toward the rack (+x)
  await ptr(page, 'pointerdown', cue.x, cue.y);
  for (let i = 1; i <= 6; i++) { await ptr(page, 'pointermove', cue.x + (aimTarget.x - cue.x) * i / 6, cue.y); await page.waitForTimeout(20); }
  await page.waitForTimeout(150);
  await page.screenshot({ path: SS('B3-3-ortho-aim.png') });
  await ptr(page, 'pointerup', aimTarget.x, cue.y, 0);

  // 4) toggle back to perspective
  await page.keyboard.press('t');
  await page.waitForTimeout(700);
  const persp1 = await perspCam(page);
  await page.screenshot({ path: SS('B3-4-restored.png') });

  console.log(`B3 perspCam start=${JSON.stringify(persp0)} duringOrtho=${JSON.stringify(perspDuringOrtho)} restored=${JSON.stringify(persp1)}`);
  console.log(`B3 ortho cue screen=${JSON.stringify(cue)} aimTarget=${JSON.stringify(aimTarget)}`);

  // Programmatic restore checks: perspective stays at POSE_TABLE throughout (ortho is separate)
  expect(persp0, 'perspective camera present').not.toBeNull();
  expect(Math.abs(persp1!.x - persp0!.x)).toBeLessThan(0.05);
  expect(Math.abs(persp1!.y - persp0!.y)).toBeLessThan(0.05);
  expect(Math.abs(persp1!.z - persp0!.z)).toBeLessThan(0.05);
  // POSE_TABLE = (0, 2.5, 1.8)
  expect(Math.abs(persp1!.y - 2.5)).toBeLessThan(0.1);
  expect(Math.abs(persp1!.z - 1.8)).toBeLessThan(0.1);
});
