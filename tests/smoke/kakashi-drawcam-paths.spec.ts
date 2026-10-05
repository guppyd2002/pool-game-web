/**
 * 卡卡西 QA — vs-Robot vs HotSeat drawing-camera reconciliation on prod 11638b7.
 *
 * Measures the TRUE drawing camera (by wrapping renderer.render — the actual draw
 * call), NOT __poolDebug.camera (always the parked PerspectiveCamera, never drawn).
 * Occupancy measured TWO independent ways:
 *   (A) project cushion-nose corners through the captured draw camera
 *   (B) pure canvas-pixel extent of non-background content (uses NO camera variable)
 * Projection type discriminated by: isOrthographicCamera flag, projectionMatrix[11]
 * (ortho→0, perspective→-1), and far/near long-edge convergence ratio (1.0→ortho).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const VP = { width: 844, height: 390 };          // 8BP benchmark landscape 2.166:1
const VP_PORT = { width: 390, height: 844 };      // CEO suspected portrait grip

// world geometry (scene.ts): nose-to-nose 2.54 x 1.27, ball radius 0.0285
const HALF_X = 2.54 / 2;
const HALF_Z = 1.27 / 2;
const BALL_R = 0.0285;
const Y_PLANE = BALL_R; // ball/felt plane

type Probe = {
  drawType: string;
  isOrtho: boolean;
  isPersp: boolean;
  projM11: number;          // elements[11]: 0 ortho, -1 perspective
  camPos: number[];
  // (A) corner-projection occupancy (nose-to-nose)
  projFracW: number;
  projFracH: number;
  projArea: number;
  nearEdgePx: number;       // long edge nearest camera, screen px
  farEdgePx: number;        // long edge farthest, screen px
  convergeRatio: number;    // far/near (1.0 => no foreshortening => ortho)
  ballDiamNearPx: number;
  ballDiamFarPx: number;
  ballDiamRatio: number;
  // (B) pure-pixel occupancy
  pxFracW: number;
  pxFracH: number;
  pxArea: number;
};

async function installInterceptor(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (window as any).__poolDebug?.renderer, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const w = window as any;
    const r = w.__poolDebug.renderer;
    if (r.__wrapped) return;
    const orig = r.render.bind(r);
    r.render = (scene: any, cam: any) => { w.__lastDrawCam = cam; orig(scene, cam); };
    r.__wrapped = true;
  });
}

async function measure(page: import('@playwright/test').Page): Promise<Probe> {
  return await page.evaluate(({ HALF_X, HALF_Z, BALL_R, Y_PLANE }) => {
    const w = window as any;
    const d = w.__poolDebug;
    const cam = w.__lastDrawCam;
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix?.();

    const W = window.innerWidth, H = window.innerHeight;
    const tmp = d.balls[0].position.clone(); // reuse a THREE.Vector3 instance
    const toScreen = (x: number, y: number, z: number) => {
      tmp.set(x, y, z); tmp.project(cam);
      return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
    };

    // four cushion-nose corners
    const c = [
      toScreen(-HALF_X, Y_PLANE, -HALF_Z),
      toScreen(+HALF_X, Y_PLANE, -HALF_Z),
      toScreen(+HALF_X, Y_PLANE, +HALF_Z),
      toScreen(-HALF_X, Y_PLANE, +HALF_Z),
    ];
    const xs = c.map(p => p.x), ys = c.map(p => p.y);
    const projW = Math.max(...xs) - Math.min(...xs);
    const projH = Math.max(...ys) - Math.min(...ys);
    // long edges along X at the two Z extremes
    const edgeZneg = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
    const edgeZpos = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y);
    const nearEdge = Math.max(edgeZneg, edgeZpos);
    const farEdge = Math.min(edgeZneg, edgeZpos);

    // ball diameters at near (cue X=-HALF_X/2) and far (X=+HALF_X*0.75) depths
    const ballDiam = (bx: number, bz: number) => {
      const a = toScreen(bx - BALL_R, Y_PLANE, bz);
      const b = toScreen(bx + BALL_R, Y_PLANE, bz);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const diamNear = ballDiam(-HALF_X / 2, 0);
    const diamFar = ballDiam(+HALF_X * 0.75, 0);

    // (B) pure canvas-pixel occupancy — no camera used
    const canvas = d.renderer.domElement as HTMLCanvasElement;
    const cw = canvas.width, ch = canvas.height;
    const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    const ctx = c2.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, cw, ch).data;
    // background = scene.background 0x1a1a2e = (26,26,46)
    const isBg = (r: number, g: number, b: number) =>
      Math.abs(r - 26) < 18 && Math.abs(g - 26) < 18 && Math.abs(b - 46) < 22;
    let minX = cw, maxX = -1, minY = ch, maxY = -1, content = 0;
    for (let y = 0; y < ch; y += 2) {
      for (let x = 0; x < cw; x += 2) {
        const i = (y * cw + x) * 4;
        if (!isBg(img[i], img[i + 1], img[i + 2])) {
          content++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const pxW = maxX >= 0 ? (maxX - minX) / cw : 0;
    const pxH = maxY >= 0 ? (maxY - minY) / ch : 0;
    const pxArea = (content * 4) / (cw * ch); // *4: sampled every 2px in both axes

    const pm = cam.projectionMatrix.elements;
    return {
      drawType: cam.type,
      isOrtho: !!cam.isOrthographicCamera,
      isPersp: !!cam.isPerspectiveCamera,
      projM11: pm[11],
      camPos: cam.position.toArray().map((n: number) => +n.toFixed(3)),
      projFracW: +(projW / W).toFixed(3),
      projFracH: +(projH / H).toFixed(3),
      projArea: +((projW * projH) / (W * H)).toFixed(3),
      nearEdgePx: +nearEdge.toFixed(1),
      farEdgePx: +farEdge.toFixed(1),
      convergeRatio: +(farEdge / nearEdge).toFixed(3),
      ballDiamNearPx: +diamNear.toFixed(1),
      ballDiamFarPx: +diamFar.toFixed(1),
      ballDiamRatio: +(diamFar / diamNear).toFixed(3),
      pxFracW: +pxW.toFixed(3),
      pxFracH: +pxH.toFixed(3),
      pxArea: +pxArea.toFixed(3),
    };
  }, { HALF_X, HALF_Z, BALL_R, Y_PLANE });
}

test('vs-Robot path: drawing camera + occupancy @11638b7 844x390', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VP, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await installInterceptor(page);
  await page.locator('#btn-vs-ai').click();
  await page.waitForTimeout(1500); // settle enter-table + a few frames
  const probe = await measure(page);
  console.log('VSROBOT ' + JSON.stringify(probe));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-vsrobot-11638b7.png' });
  expect(probe.drawType).toBeTruthy();
  await ctx.close();
});

test('HotSeat path: drawing camera + occupancy @11638b7 844x390', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VP, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await installInterceptor(page);
  await page.locator('#btn-start').click();
  await page.waitForTimeout(3200); // find-opponent carousel ~1.5-2.8s + settle
  const probe = await measure(page);
  console.log('HOTSEAT ' + JSON.stringify(probe));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-hotseat-11638b7.png' });
  expect(probe.drawType).toBeTruthy();
  await ctx.close();
});

test('vs-Robot PORTRAIT: drawing camera + occupancy @11638b7 390x844', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VP_PORT, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await installInterceptor(page);
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const probe = await measure(page);
  console.log('VSROBOT_PORT ' + JSON.stringify(probe));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-vsrobot-portrait-11638b7.png' });
  expect(probe.drawType).toBeTruthy();
  await ctx.close();
});

test('HotSeat PORTRAIT: drawing camera + occupancy @11638b7 390x844', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VP_PORT, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await installInterceptor(page);
  await page.evaluate(() => (document.querySelector('#btn-start') as HTMLButtonElement)?.click());
  await page.waitForTimeout(3200);
  const probe = await measure(page);
  console.log('HOTSEAT_PORT ' + JSON.stringify(probe));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-hotseat-portrait-11638b7.png' });
  expect(probe.drawType).toBeTruthy();
  await ctx.close();
});
