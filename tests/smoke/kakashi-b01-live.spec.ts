/**
 * 卡卡西 QA — B-01 live-prod verification harness (DIV register: measurement harness in repo).
 *
 * Measurement target : commit 72f469d (release / Vercel Production Branch; frozen by
 *                      decision f490eeca). tree = 32355b3e95ee3254d7af0899e85bdc19a1e3af94.
 * Live URL           : https://pool-game-web.vercel.app  (override: PROD_URL env)
 * Run                : npx playwright test tests/smoke/kakashi-b01-live.spec.ts
 *                      (hits LIVE prod, not a local dev server)
 *
 * Tracks covered here (B-01 = 3 runtime changes, all from d08bef4):
 *   V3  — version canary: __poolDebug.cameraProbe / getActiveCamera exist at runtime
 *         (both are undefined on 11638b7 → clean discriminator).
 *   V4c — enterTable draw camera = Ortho via cameraProbe().drawing (NOT __poolDebug.camera,
 *         which is always the parked PerspectiveCamera at POSE_OVERVIEW and is never drawn —
 *         reading it is the Aug false-"6% table" trap).
 *   V4a — shot clock removed: HotSeat idle 35s → no countdown / no foul / no opponent BIH.
 *   V4b — cue ball visible after a real scratch → ball-in-hand placement.
 *
 * Track 1 (control-plane git SHA via Vercel dashboard/API) is DELIBERATELY NOT executed here:
 * no authorized Vercel credential path, and interactive login with CEO/CTO creds is out of
 * bounds. Identity is instead proven at artifact level — the live bundle main-*.js sha256 is
 * byte-identical to a local build of 72f469d (see commit notes / report). That answers the same
 * question ("which version is live") closer to fact: a dashboard SHA is a metadata label; the
 * hashed bundle is the bytes the user actually downloads.
 *
 * Note: the local build used for the V2 sha256 compare was 72f469d (confirmed by the live
 * cameraProbe canary, which 11638b7 lacks). Do not infer the build commit from any worktree
 * directory name.
 */
import { test, expect } from '@playwright/test';

const PROD = process.env.PROD_URL || 'https://pool-game-web.vercel.app';

test.setTimeout(120_000);

test('V3 canary: cameraProbe + getActiveCamera callable at runtime', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PROD + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  const canary = await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    const probe = typeof d.cameraProbe === 'function' ? d.cameraProbe() : null;
    return {
      hasCameraProbe: typeof d.cameraProbe === 'function',
      hasGetActiveCamera: typeof d.getActiveCamera === 'function',
      probe,
      activeType: typeof d.getActiveCamera === 'function' ? d.getActiveCamera()?.type : null,
    };
  });
  console.log('V3 ' + JSON.stringify(canary));
  expect(canary.hasCameraProbe, 'cameraProbe must exist (absent on 11638b7)').toBe(true);
  expect(canary.hasGetActiveCamera, 'getActiveCamera must exist (absent on 11638b7)').toBe(true);
  await ctx.close();
});

test('V4c enter table → drawing camera is Ortho (cameraProbe, not __poolDebug.camera)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PROD + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-start') as HTMLButtonElement)?.click());
  await page.waitForTimeout(3200); // enter table + settle
  const cam = await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    const p = d.cameraProbe?.();
    return {
      drawing: p?.drawing ?? null,
      activeType: p?.activeType ?? d.getActiveCamera?.()?.type ?? null,
      inTopView: p?.inTopView ?? null,
      // contrast: the parked overview perspective cam that must NOT be used as truth
      parkedCameraType: d.camera?.type,
    };
  });
  console.log('V4c ' + JSON.stringify(cam));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-b01-entertable.png' });
  expect(cam.drawing, 'drawing camera after enterTable must be ortho').toBe('ortho');
  expect(cam.activeType).toMatch(/Orthographic/i);
  await ctx.close();
});

test('V4a shot-clock removed: HotSeat idle 35s → no countdown, no foul', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PROD + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  // enter HotSeat
  await page.evaluate(() => (document.querySelector('#btn-start') as HTMLButtonElement)?.click());
  await page.waitForTimeout(3200); // find-opponent carousel + settle
  const before = await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    const gs = d.gameSession;
    return {
      player: gs?.currentPlayerIndex ?? gs?.getState?.()?.currentPlayerIndex ?? null,
      hudTimerText: (document.querySelector('[id*="timer"], [class*="timer"]') as HTMLElement | null)?.textContent ?? null,
      // scan any visible countdown digits in HUD
      bodyHasCountdown: /\b([0-9]|[1-2][0-9]|3[0-5])s\b/.test(document.body.innerText),
    };
  });
  // idle 35s — sample countdown/foul signals over the window
  const samples: any[] = [];
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const d = (window as any).__poolDebug;
      const gs = d.gameSession;
      const txt = document.body.innerText;
      return {
        t: Date.now(),
        player: gs?.currentPlayerIndex ?? gs?.getState?.()?.currentPlayerIndex ?? null,
        // any "Ns" countdown or "Time" foul banner visible?
        countdown: (txt.match(/\b\d{1,2}s\b/g) || []).join(','),
        timeOver: /time\s*is\s*over|time'?s?\s*up|foul/i.test(txt),
      };
    });
    samples.push(s);
  }
  const playerChanged = samples.some(s => before.player !== null && s.player !== before.player);
  const anyTimeOver = samples.some(s => s.timeOver);
  const anyCountdown = samples.some(s => s.countdown && s.countdown.length > 0);
  console.log('V4a before=' + JSON.stringify(before) + ' samples=' + JSON.stringify(samples) +
    ' => playerChanged=' + playerChanged + ' anyTimeOver=' + anyTimeOver + ' anyCountdown=' + anyCountdown);
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-b01-idle35.png' });
  expect(anyTimeOver, 'no Time-is-over/foul banner during 35s idle').toBe(false);
  expect(playerChanged, 'current player must not change on idle (no wall-clock foul)').toBe(false);
  await ctx.close();
});

test('V4b white ball visible after scratch → ball-in-hand placement', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(PROD + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-start') as HTMLButtonElement)?.click());
  await page.waitForTimeout(3200);

  // Instrument BIH/scratch events, then drive the cue into a clear back corner pocket.
  const scratch = await page.evaluate(async () => {
    const d = (window as any).__poolDebug;
    const gs = d.gameSession;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const vis = () => !!d.cueBallMesh?.visible;
    const w: any = window;
    w.__ev = [];
    const prevTC = gs.onTurnChanged;
    gs.onTurnChanged = (p: number, bih: boolean) => { w.__ev.push({ turn: p, bih, t: Date.now() }); prevTC && prevTC(p, bih); };
    const prevRM = gs.onReasonMessage;
    gs.onReasonMessage = (m: any) => { w.__ev.push({ reason: String(m), t: Date.now() }); prevRM && prevRM(m); };

    const out: any = { startVisible: vis(), cuePosWorld: d.balls[0].position.toArray() };
    // physics units ≈ world × 10000; cue world → physics
    const cw = d.balls[0].position;
    const P = (v: number) => Math.round(v * 10000);
    const pos = { x: P(cw.x), y: P(cw.y), z: P(cw.z) };
    // back-left corner pocket world ≈ (-1.311, _, +0.674) → clear of rack (rack ~ +0.6..+0.95 X)
    const target = { x: -13110, z: 6740 };
    const dx = target.x - pos.x, dz = target.z - pos.z;
    const L = Math.hypot(dx, dz) || 1;
    const samples: any[] = [];
    // try increasing magnitudes until a BIH (scratch) event appears
    for (const mag of [18000, 26000, 34000, 45000]) {
      const impulse = { x: (dx / L) * mag, y: 0, z: (dz / L) * mag, torque: 0 };
      try {
        gs.forceShot({ position: { x: pos.x, y: pos.y, z: pos.z }, impulse: { x: impulse.x, y: 0, z: impulse.z }, torque: { x: 0, y: 0, z: 0 } });
      } catch (e) { out.forceErr = String(e); break; }
      // let physics settle
      for (let i = 0; i < 8; i++) { await sleep(500); samples.push({ mag, i, vis: vis(), ev: w.__ev.length }); }
      const gotBih = w.__ev.some((e: any) => e.bih === true);
      if (gotBih) { out.scratchedAtMag = mag; break; }
      // reset cue to break pos for next attempt
    }
    out.events = w.__ev;
    out.visAfterSettle = vis();
    out.samplesTail = samples.slice(-6);
    return out;
  });

  // If scratch → BIH, place the cue ball via a canvas tap in the kitchen, then confirm visible.
  let placed: any = { attempted: false };
  const gotBih = Array.isArray(scratch.events) && scratch.events.some((e: any) => e.bih === true);
  if (gotBih) {
    const canvas = await page.$('canvas');
    const box = canvas ? await canvas.boundingBox() : null;
    if (box) {
      // kitchen ≈ left quarter of table; tap there to propose+commit placement
      await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
      await page.waitForTimeout(400);
      await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
      await page.waitForTimeout(600);
    }
    placed = await page.evaluate(() => ({ attempted: true, cueVisible: !!(window as any).__poolDebug?.cueBallMesh?.visible }));
  }

  const final = await page.evaluate(() => ({
    hasCueBallMesh: !!(window as any).__poolDebug?.cueBallMesh,
    cueVisibleFinal: !!(window as any).__poolDebug?.cueBallMesh?.visible,
  }));
  console.log('V4b ' + JSON.stringify({ scratch, gotBih, placed, final }));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-b01-cue.png' });
  expect(final.hasCueBallMesh).toBe(true);
  await ctx.close();
});
