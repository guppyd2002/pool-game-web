/**
 * CEO prod repro measurements (卡卡西 QA + 鳴人 root-cause update).
 *
 * CRITICAL: `window.__poolDebug.camera` is ALWAYS the PerspectiveCamera.
 * After enterTable(top), render uses OrthographicCamera via setOrthoTop.
 * Measuring with `camera` alone projected the parked OVERVIEW pose (~6% table)
 * while the screen drew large top-ortho — that mismatch caused the false
 * "play view never applied" diagnosis.
 *
 * Use __poolDebug.cameraProbe() / getActiveCamera() for drawing camera.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

async function startHotSeat(page: import('@playwright/test').Page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  await page.locator('#btn-start').click();
  // find-opponent carousel ~1.5s
  await page.waitForTimeout(2800);
}

test('enter table: drawing camera is OrthographicCamera (top default)', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await startHotSeat(page);
  const probe = await page.evaluate(() => {
    const d = (window as unknown as { __poolDebug: {
      cameraProbe?: () => { drawing: string; activeType: string | null; perspectivePos: number[] };
      getActiveCamera?: () => { type?: string };
      camera: { position: { toArray: () => number[] }; fov: number; type?: string };
    } }).__poolDebug;
    const p = d.cameraProbe?.();
    return {
      drawing: p?.drawing,
      activeType: p?.activeType ?? d.getActiveCamera?.()?.type,
      perspectivePos: p?.perspectivePos ?? d.camera.position.toArray(),
      perspectiveFov: d.camera.fov,
    };
  });
  console.log('CEO-REPRO enter probe', JSON.stringify(probe));
  expect(probe.drawing, 'render must use ortho after enterTable(top)').toBe('ortho');
  expect(probe.activeType).toMatch(/Orthographic/i);
  await ctx.close();
});

test('orbit toggle applies getPlayView pose on perspective camera', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await startHotSeat(page);
  // Toggle top → orbit via HUD button
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#hud-bar button')];
    const b = btns.find((x) => /Table|Top|⬆|⬇/.test(x.textContent || ''));
    (b as HTMLElement | undefined)?.click();
  });
  await page.waitForTimeout(400);
  const probe = await page.evaluate(() => {
    const d = (window as unknown as { __poolDebug: {
      cameraProbe: () => {
        drawing: string;
        perspectivePos: number[];
        perspectiveFov: number;
        playView: { pose: { position: number[] }; fov: number };
      };
    } }).__poolDebug;
    return d.cameraProbe();
  });
  console.log('CEO-REPRO orbit probe', JSON.stringify(probe));
  expect(probe.drawing).toBe('perspective');
  expect(probe.perspectivePos[1]).toBeCloseTo(probe.playView.pose.position[1], 2);
  expect(probe.perspectivePos[2]).toBeCloseTo(probe.playView.pose.position[2], 2);
  await ctx.close();
});
