/**
 * 卡卡西 QA — T-rule touch-target scan (44px hard gate) @ portrait 375x607.
 *
 * Rule (綱手 2026-10-07, decision 227d409b companion): every control's touchable
 * area min(width,height) must be >= 44 CSS px, on every device/mode incl. PWA
 * standalone. <44 = FAIL. Covers spin-disc / power-slider / fine-adjust / all icon btns.
 *
 * Run: npx playwright test tests/smoke/kakashi-touch-target-scan.spec.ts
 *      (local dev server; BASE_URL to override). Enter via vs-Robot DOM click to
 *      bypass the rotate-gate overlay; controls render behind it.
 *
 * First baseline (commit 6bdb2ab = promote/0g-pwa-to-release, chrome-visible, vv 375x607,
 * dpr 1, standalone=false): FAILs = fine-adjust track 32px + thumb 28px, hud-bar all 5
 * buttons 28px, one small ×-btn 14px; PASS = spin-disc 68, power-slider 80.
 *
 * ⚠️ Branch divergence to keep straight when reading results:
 *  - 6bdb2ab (0g-pwa) fine-adjust = old 8BP-v2.1: no class, no max-height cap → flat 32px;
 *    --gutter-* CSS vars EMPTY (controls at fixed fallback, NOT gutter-driven).
 *  - master's gutter-driven version (feat/phase1-linea-ortho-gutter) caps fine-adjust
 *    max-height to ~24px → effective ~11px (§F.10). Both FAIL, different numbers.
 *  Always record the measured commit + whether --gutter-* vars are set.
 *
 * Limitation: PWA standalone (display-mode:standalone) + true gutter sizing need a real
 * device (add-to-homescreen); Playwright can't emulate it. This spec runs chrome-visible.
 * The fine-adjust track is display:none by default here — see kakashi-fineadjust-measure.spec.ts
 * which forces it visible to read its real rect.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

test('T-rule scan @375x607 portrait', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 607 }, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  // enter table (vs-Robot, no carousel); DOM-click to bypass any rotate-gate overlay
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    const env = {
      innerW: window.innerWidth, innerH: window.innerHeight,
      vvW: window.visualViewport?.width, vvH: window.visualViewport?.height,
      dpr: window.devicePixelRatio,
      standalone: (matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true,
      gutterLeft: getComputedStyle(document.documentElement).getPropertyValue('--gutter-left'),
      gutterBottom: getComputedStyle(document.documentElement).getPropertyValue('--gutter-bottom'),
      gutterRight: getComputedStyle(document.documentElement).getPropertyValue('--gutter-right'),
      feltWidth: getComputedStyle(document.documentElement).getPropertyValue('--felt-width'),
      rotateGate: (() => { const r = document.querySelector('#rotate-prompt') as HTMLElement | null; return r ? getComputedStyle(r).display : 'none-el'; })(),
    };
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const row = (el: Element, label: string) => {
      const r = el.getBoundingClientRect();
      return {
        label, tag: el.tagName.toLowerCase(), cls: (el as HTMLElement).className || '',
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        min: +Math.min(r.width, r.height).toFixed(1),
        vis: vis(el),
      };
    };
    const out: any[] = [];
    const scanRoot = (sel: string, name: string) => {
      const root = document.querySelector(sel);
      if (!root) { out.push({ label: name + ' (ROOT)', missing: true }); return; }
      out.push(row(root, name + ' [overlay root]'));
      root.querySelectorAll('div,button,canvas').forEach((c, i) => {
        if (!vis(c)) return;
        out.push(row(c, `${name} child#${i}`));
      });
    };
    scanRoot('.fine-adjust-overlay', 'fine-adjust');
    scanRoot('.power-slider-overlay', 'power-slider');
    scanRoot('.spin-disc-overlay', 'spin-disc');
    // hud-bar buttons
    document.querySelectorAll('#hud-bar button').forEach((b, i) => { if (vis(b)) out.push(row(b, `hud-bar btn#${i}`)); });
    // any other visible buttons on screen (exclude menu which should be hidden)
    document.querySelectorAll('button').forEach((b) => {
      if (!vis(b)) return;
      if (b.closest('#hud-bar') || b.closest('.fine-adjust-overlay') || b.closest('.power-slider-overlay') || b.closest('.spin-disc-overlay')) return;
      out.push(row(b, `other-btn`));
    });
    return { env, rows: out };
  });

  console.log('TSCAN_ENV ' + JSON.stringify(data.env));
  for (const r of data.rows) console.log('TSCAN_ROW ' + JSON.stringify(r));
  await page.screenshot({ path: 'tests/smoke/screenshots/kakashi-tscan-375x607.png' });
  expect(data.rows.length).toBeGreaterThan(0);
  await ctx.close();
});
