/**
 * 卡卡西 QA — effective touch-width probe (T-rule companion to kakashi-touch-target-scan).
 *
 * Why box size (getBoundingClientRect) is NOT enough for the 44px T-rule: a parent with
 * overflow:hidden clips a child's HITTABLE area. This probe walks elementFromPoint across
 * each control to measure the real usable touch width/height.
 *
 * It hides #rotate-prompt first — in portrait the rotate-gate (z-index 9999) covers the
 * whole screen, so elementFromPoint would otherwise return the gate (0 control hits). We
 * hide it only to isolate the overflow-clip effect, not to change gate behavior.
 *
 * Baseline finding @ master 42f2654 (375x607, gutter-driven):
 *   power-slider: track box 80 but overlay gutter-compressed to 33 + overflow:hidden
 *                 => effective hit width ~38px => FAIL (box 80 is misleading).
 *   spin-disc:    button 68 fully hittable (no overflow:hidden) => PASS size, but overflows
 *                 the gutter by ~35px into the felt => #4 overlap, not a T failure.
 * Lesson: judge the T-rule by effective hit, not the box.
 */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
test('effective touch width via elementFromPoint @375x607 master', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 607 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    // hide the rotate-gate overlay (z-index 9999) so elementFromPoint reaches the controls;
    // we are isolating the overflow:hidden clip effect, not the gate.
    const rp = document.querySelector('#rotate-prompt') as HTMLElement | null;
    if (rp) rp.style.display = 'none';
    const effWidth = (target: Element) => {
      const r = target.getBoundingClientRect();
      const cy = Math.round(r.top + r.height / 2);
      let hit = 0; const minX = Math.floor(r.left) - 4, maxX = Math.ceil(r.right) + 4;
      for (let x = minX; x <= maxX; x++) {
        const el = document.elementFromPoint(x, cy);
        if (el && (el === target || target.contains(el) || el.contains(target))) hit++;
      }
      return { rectW: +r.width.toFixed(1), effHitW: hit };
    };
    const effHeight = (target: Element) => {
      const r = target.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      let hit = 0; const minY = Math.floor(r.top) - 4, maxY = Math.ceil(r.bottom) + 4;
      for (let y = minY; y <= maxY; y++) {
        const el = document.elementFromPoint(cx, y);
        if (el && (el === target || target.contains(el) || el.contains(target))) hit++;
      }
      return { rectH: +r.height.toFixed(1), effHitH: hit };
    };
    const out: any = {};
    const powerOverlay = document.querySelector('.power-slider-overlay');
    const powerTrack = powerOverlay?.querySelectorAll('div')[1] || null; // child#1 = track (80x240)
    const spinOverlay = document.querySelector('.spin-disc-overlay');
    const spinBtn = spinOverlay?.querySelector('button') || null;
    out.powerOverlay = powerOverlay ? powerOverlay.getBoundingClientRect().width.toFixed(1) : null;
    out.powerTrack = powerTrack ? { ...effWidth(powerTrack), ...effHeight(powerTrack) } : null;
    out.spinOverlay = spinOverlay ? spinOverlay.getBoundingClientRect().width.toFixed(1) : null;
    out.spinBtn = spinBtn ? { ...effWidth(spinBtn), ...effHeight(spinBtn) } : null;
    // does spin button overflow into felt? compare button right vs overlay right
    if (spinOverlay && spinBtn) {
      const ob = spinOverlay.getBoundingClientRect(), bb = spinBtn.getBoundingClientRect();
      out.spinBtnOverflowPx = +(bb.right - ob.right).toFixed(1);
    }
    return out;
  });
  console.log('EFFHIT ' + JSON.stringify(res));
  expect(res).toBeTruthy();
  await ctx.close();
});
