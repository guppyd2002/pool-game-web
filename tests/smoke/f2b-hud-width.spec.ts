/**
 * Phase 1 F-2b-3 — measure hud-bar horizontal fit at 375 CSS px.
 * Report overflow; do not invent a new layout if it overflows.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'phase1-f2b');

test.describe('F-2b-3 hud horizontal @375', () => {
  test.setTimeout(90_000);

  test('measure #hud-bar row at 375×667', async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('#btn-vs-ai, #btn-start', { timeout: 60000 });
    await page.evaluate(() => {
      const ai = document.querySelector('#btn-vs-ai') as HTMLButtonElement | null;
      const start = document.querySelector('#btn-start') as HTMLButtonElement | null;
      (ai ?? start)?.click();
    });
    await page.waitForSelector('#hud-bar', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => {
      const bar = document.getElementById('hud-bar');
      if (bar) bar.style.visibility = 'visible';
      if (bar) bar.style.display = 'flex';
    });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const bar = document.getElementById('hud-bar');
      if (!bar) return null;
      const cs = getComputedStyle(bar);
      const children = [...bar.children] as HTMLElement[];
      const childBoxes = children.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          id: el.id || el.className || el.getAttribute('aria-label') || el.textContent?.slice(0, 12),
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
          overflowX: el.scrollWidth > el.clientWidth + 1,
        };
      });
      const sumChildW = childBoxes.reduce((s, c) => s + c.w, 0);
      const gap = parseFloat(cs.gap) || 0;
      const gapsTotal = gap * Math.max(0, children.length - 1);
      return {
        barHeight: cs.height,
        barClientWidth: bar.clientWidth,
        barScrollWidth: bar.scrollWidth,
        barOverflowX: bar.scrollWidth > bar.clientWidth + 1,
        paddingLeft: cs.paddingLeft,
        paddingRight: cs.paddingRight,
        gap,
        gapsTotal,
        sumChildW,
        sumChildWPlusGaps: sumChildW + gapsTotal,
        hudBarHeightVar: cs.getPropertyValue('--hud-bar-height').trim() ||
          getComputedStyle(document.documentElement).getPropertyValue('--hud-bar-height').trim(),
        childBoxes,
      };
    });

    expect(metrics).toBeTruthy();
    fs.writeFileSync(path.join(OUT, 'hud-width-375.json'), JSON.stringify(metrics, null, 2));
    await page.locator('#hud-bar').screenshot({ path: path.join(OUT, 'hud-bar-375.png') });

    // Soft assert: we report either way; fail only if bar missing.
    // Overflow is reported in artifacts for 綱手 — do not redesign here.
    console.log('F-2b-3 metrics', JSON.stringify(metrics, null, 2));
  });
});
