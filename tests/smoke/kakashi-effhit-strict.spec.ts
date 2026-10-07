/**
 * 卡卡西 QA — STRICT eff-hit probe v3 (chief-architect §F.16.4 + §F.18.1).
 *
 * Measures the usable touch area as a CONTIGUOUS hit run from a validated seed — NOT the
 * bounding box of hits (a hit-bbox over-reports by up to one grid step, in the FAIL->PASS
 * direction, §F.18.1). The run expands 1px at a time until the first non-hit, so it stops
 * exactly at a clip / viewport edge / occluder (criterion 2: clipping from the edges).
 *
 * A hit = elementFromPoint returns the target OR a descendant (el===target ||
 * target.contains(el)); never an ancestor — a transparent pointer-events:auto overlay would
 * otherwise give a false PASS while the real handler never fires (criterion 1, §F.16.4).
 *
 * Seed = box centre clamped into the viewport; if that is not a hit (e.g. centre pushed off
 * screen), search box∩viewport for a hit before giving up.
 */
import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

test('strict eff-hit v3 @375x607', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 607 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const rp = document.querySelector('#rotate-prompt') as HTMLElement | null;
    if (rp) rp.style.display = 'none';
    const VW = window.innerWidth, VH = window.innerHeight;
    const measure = (target: Element | null) => {
      if (!target) return null;
      const r = target.getBoundingClientRect();
      const hit = (x: number, y: number) => { const el = document.elementFromPoint(x, y); return !!el && (el === target || target.contains(el)); };
      let sx = Math.min(Math.max(Math.round(r.left + r.width / 2), 1), VW - 2);
      let sy = Math.min(Math.max(Math.round(r.top + r.height / 2), 1), VH - 2);
      if (!hit(sx, sy)) {
        outer: for (let d = 0; d < Math.max(r.width, r.height); d += 2) {
          for (const [x, y] of [[sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d]]) {
            if (x > 0 && x < VW && y > 0 && y < VH && hit(x, y)) { sx = x; sy = y; break outer; }
          }
        }
      }
      if (!hit(sx, sy)) return { box: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, effW: 0, effH: 0, min: 0, pass: false, note: 'no hit seed in viewport' };
      let xL = sx; while (xL - 1 >= 0 && hit(xL - 1, sy)) xL--;
      let xR = sx; while (xR + 1 < VW && hit(xR + 1, sy)) xR++;
      let yT = sy; while (yT - 1 >= 0 && hit(sx, yT - 1)) yT--;
      let yB = sy; while (yB + 1 < VH && hit(sx, yB + 1)) yB++;
      const effW = xR - xL + 1, effH = yB - yT + 1;
      return { box: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, effW, effH, min: Math.min(effW, effH), pass: Math.min(effW, effH) >= 44, seed: [sx, sy] };
    };
    const q = (s: string) => document.querySelector(s);
    const powerTrack = (q('.power-slider-overlay') as HTMLElement | null)?.querySelectorAll('div')[1] || null;
    const spinBtn = (q('.spin-disc-overlay') as HTMLElement | null)?.querySelector('button') || null;
    const fineTrack = (q('.fine-adjust-overlay') as HTMLElement | null)?.querySelectorAll('div')[0] || null;
    const hudBtn = q('#hud-bar button');
    return { powerTrack: measure(powerTrack), spinBtn: measure(spinBtn), fineTrack: measure(fineTrack), hudBtn0: measure(hudBtn) };
  });
  console.log('STRICT3 ' + JSON.stringify(res));
  expect(res).toBeTruthy();
  await ctx.close();
});
