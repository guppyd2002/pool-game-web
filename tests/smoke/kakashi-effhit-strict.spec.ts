/**
 * 卡卡西 QA — STRICT effective touch-hit probe (chief-architect Q4 tightening).
 *  (1) a hit = elementFromPoint is the target OR a descendant of it (NOT an ancestor /
 *      transparent overlay) — el===target || target.contains(el). No el.contains(target).
 *  (2) sample a 1px grid over the nominal box ± margin (covers all 4 edges + 4 corners),
 *      report the hit bounding box (so edge-clipping is visible), not a centre line.
 * Also dumps actual --gutter-left/right + --felt-* + overlay rect to explain 38-vs-33.
 */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

test('strict eff-hit @375x607', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 607 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const rp = document.querySelector('#rotate-prompt') as HTMLElement | null;
    if (rp) rp.style.display = 'none'; // isolate clip, not the gate

    const M = 8; // margin beyond box to catch over-extension
    const strictHit = (target: Element, el: Element | null) => !!el && (el === target || target.contains(el));
    const measure = (target: Element | null) => {
      if (!target) return null;
      const r = target.getBoundingClientRect();
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, hits = 0;
      for (let y = Math.floor(r.top) - M; y <= Math.ceil(r.bottom) + M; y++) {
        for (let x = Math.floor(r.left) - M; x <= Math.ceil(r.right) + M; x++) {
          if (strictHit(target, document.elementFromPoint(x, y))) {
            hits++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const corner = (x: number, y: number) => strictHit(target, document.elementFromPoint(x, y));
      return {
        box: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1) },
        effW: hits ? maxX - minX + 1 : 0, effH: hits ? maxY - minY + 1 : 0,
        hitLeft: hits ? minX : null, hitRight: hits ? maxX : null,
        corners: {
          TL: corner(Math.ceil(r.left) + 1, Math.ceil(r.top) + 1),
          TR: corner(Math.floor(r.right) - 1, Math.ceil(r.top) + 1),
          BL: corner(Math.ceil(r.left) + 1, Math.floor(r.bottom) - 1),
          BR: corner(Math.floor(r.right) - 1, Math.floor(r.bottom) - 1),
        },
      };
    };
    const q = (s: string) => document.querySelector(s);
    const powerOverlay = q('.power-slider-overlay') as HTMLElement | null;
    const powerTrack = powerOverlay?.querySelectorAll('div')[1] || null;
    const spinBtn = (q('.spin-disc-overlay') as HTMLElement | null)?.querySelector('button') || null;
    const fineTrack = (q('.fine-adjust-overlay') as HTMLElement | null)?.querySelectorAll('div')[0] || null;
    const hudBtn = q('#hud-bar button');

    const cs = powerOverlay ? getComputedStyle(powerOverlay) : null; // inherits --gutter-* from #app
    const gv = (n: string) => cs?.getPropertyValue(n).trim() || (q('#app') ? getComputedStyle(q('#app')!).getPropertyValue(n).trim() : '') || '';
    return {
      vars: {
        gutterLeft: gv('--gutter-left'), gutterRight: gv('--gutter-right'),
        feltLeft: gv('--felt-left'), feltWidth: gv('--felt-width'), feltRight: gv('--felt-right'),
      },
      powerOverlayRect: powerOverlay ? { w: +powerOverlay.getBoundingClientRect().width.toFixed(1), left: +powerOverlay.getBoundingClientRect().left.toFixed(1), right: +powerOverlay.getBoundingClientRect().right.toFixed(1) } : null,
      powerTrack: measure(powerTrack),
      spinBtn: measure(spinBtn),
      fineTrack: measure(fineTrack),
      hudBtn: measure(hudBtn),
    };
  });
  console.log('STRICT ' + JSON.stringify(res));
  expect(res).toBeTruthy();
  await ctx.close();
});
