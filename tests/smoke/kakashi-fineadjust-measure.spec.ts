import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
test('fine-adjust forced-visible rect @375x607', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 607 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as any).__poolDebug, null, { timeout: 60_000 });
  await page.evaluate(() => (document.querySelector('#btn-vs-ai') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    // fine-adjust overlay has no class on this branch — find via its '← Fine Aim →' label
    const label = [...document.querySelectorAll('div')].find(d => (d.textContent || '').includes('Fine Aim') && d.children.length === 0);
    const overlay = label ? (label.parentElement as HTMLElement) : null;
    if (!overlay) return { found: false };
    overlay.style.display = 'block'; // force-visible to measure
    const r = (el: Element | null) => { if (!el) return null; const b = (el as HTMLElement).getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), w: +b.width.toFixed(1), h: +b.height.toFixed(1), min: +Math.min(b.width, b.height).toFixed(1) }; };
    const kids = [...overlay.children];
    // track = the child whose computed height ~32; thumb inside track
    const track = kids.find(k => Math.round((k as HTMLElement).getBoundingClientRect().height) <= 40 && (k as HTMLElement).getBoundingClientRect().height >= 20 && k.tagName === 'DIV' && (k as HTMLElement).querySelector('div'));
    const thumb = track ? (track as HTMLElement).querySelector('div:last-child') : null;
    return {
      found: true,
      overlay: r(overlay),
      children: kids.map((k, i) => ({ i, ...r(k)! })),
      track: r(track as Element),
      thumb: r(thumb),
      labelText: label?.textContent,
    };
  });
  console.log('FINEADJ ' + JSON.stringify(data));
  expect(data.found).toBe(true);
  await ctx.close();
});
