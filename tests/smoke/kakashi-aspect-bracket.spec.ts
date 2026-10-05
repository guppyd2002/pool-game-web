/**
 * 卡卡西 QA — aspect bracket + rotate-gate visibility (vs-Robot path).
 *
 * Same method as kakashi-drawcam-paths: wrap renderer.render for the TRUE drawing
 * camera, occupancy two ways (corner-projection + camera-less canvas pixels).
 * NEW: reports whether #rotate-prompt is actually shown (what the USER sees),
 * since the canvas renders the table even when the DOM gate covers it.
 *
 * Paths proven byte-identical (landscape+portrait) so bracket uses vs-Robot only.
 * Run in /tmp/pgw-11638b7 (=11638b7) and in ~/pool-game-web (=d08bef4+spec) to compare.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const TAG = process.env.BUILD_TAG || 'build';

const HALF_X = 2.54 / 2, HALF_Z = 1.27 / 2, BALL_R = 0.0285, Y_PLANE = 0.0285;

const VIEWPORTS: { name: string; w: number; h: number }[] = [
  { name: 'land-844x390-2.16', w: 844, h: 390 },
  { name: 'land-1024x768-1.33', w: 1024, h: 768 },
  { name: 'land-1280x720-1.78', w: 1280, h: 720 },
  { name: 'port-768x1024-0.75', w: 768, h: 1024 },
  { name: 'port-1024x1366-0.75', w: 1024, h: 1366 },
];

for (const vp of VIEWPORTS) {
  test(`bracket ${vp.name} vs-Robot @${TAG}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__poolDebug?.renderer, null, { timeout: 60_000 });
    await page.evaluate(() => {
      const w = window as any; const r = w.__poolDebug.renderer;
      if (r.__wrapped) return;
      const orig = r.render.bind(r);
      r.render = (s: any, c: any) => { w.__lastDrawCam = c; orig(s, c); };
      r.__wrapped = true;
    });
    await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
    await page.waitForTimeout(1500);

    const probe = await page.evaluate(({ HALF_X, HALF_Z, BALL_R, Y_PLANE }) => {
      const w = window as any; const d = w.__poolDebug; const cam = w.__lastDrawCam;
      cam.updateMatrixWorld(true); cam.updateProjectionMatrix?.();
      const W = window.innerWidth, H = window.innerHeight;
      const tmp = d.balls[0].position.clone();
      const S = (x: number, y: number, z: number) => {
        tmp.set(x, y, z); tmp.project(cam);
        return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
      };
      const c = [S(-HALF_X, Y_PLANE, -HALF_Z), S(HALF_X, Y_PLANE, -HALF_Z), S(HALF_X, Y_PLANE, HALF_Z), S(-HALF_X, Y_PLANE, HALF_Z)];
      const xs = c.map(p => p.x), ys = c.map(p => p.y);
      const projW = Math.max(...xs) - Math.min(...xs), projH = Math.max(...ys) - Math.min(...ys);
      const ballDiam = (bx: number) => { const a = S(bx - BALL_R, Y_PLANE, 0), b = S(bx + BALL_R, Y_PLANE, 0); return Math.hypot(b.x - a.x, b.y - a.y); };

      const canvas = d.renderer.domElement as HTMLCanvasElement;
      const cw = canvas.width, ch = canvas.height;
      const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
      const ctx = c2.getContext('2d')!; ctx.drawImage(canvas, 0, 0);
      const img = ctx.getImageData(0, 0, cw, ch).data;
      const isBg = (r: number, g: number, b: number) => Math.abs(r - 26) < 18 && Math.abs(g - 26) < 18 && Math.abs(b - 46) < 22;
      let minX = cw, maxX = -1, minY = ch, maxY = -1, content = 0;
      for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) {
        const i = (y * cw + x) * 4;
        if (!isBg(img[i], img[i + 1], img[i + 2])) { content++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      const rp = document.querySelector('#rotate-prompt') as HTMLElement | null;
      const gateShown = !!rp && getComputedStyle(rp).display !== 'none' && rp.offsetParent !== null;
      const menuHidden = (document.querySelector('#main-menu, [id*="menu"]') as HTMLElement | null)?.style.display === 'none';

      return {
        drawType: cam.type, isOrtho: !!cam.isOrthographicCamera, projM11: cam.projectionMatrix.elements[11],
        projFracW: +(projW / W).toFixed(3), projFracH: +(projH / H).toFixed(3), projArea: +((projW * projH) / (W * H)).toFixed(3),
        ballDiamPx: +ballDiam(-HALF_X / 2).toFixed(1),
        pxFracW: +(maxX >= 0 ? (maxX - minX) / cw : 0).toFixed(3),
        pxFracH: +(maxY >= 0 ? (maxY - minY) / ch : 0).toFixed(3),
        pxArea: +((content * 4) / (cw * ch)).toFixed(3),
        gateShown, menuHidden,
      };
    }, { HALF_X, HALF_Z, BALL_R, Y_PLANE });

    console.log(`BRACKET ${TAG} ${vp.name} ` + JSON.stringify(probe));
    await page.screenshot({ path: `tests/smoke/screenshots/kakashi-bracket-${TAG}-${vp.name}.png` });
    expect(probe.drawType).toBeTruthy();
    await ctx.close();
  });
}
