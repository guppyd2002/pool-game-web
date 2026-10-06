/**
 * B-11 smoke — JS-owned rotate gate class on <html>.
 * Playwright can emulate viewport + touch; real iPad+KB matrix is merge-gate (見 PR).
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

test('portrait phone: rotate-gate-active ON (touch / coarse-like)', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => ({
    active: document.documentElement.classList.contains('rotate-gate-active'),
    display: getComputedStyle(document.querySelector('#rotate-prompt')!).display,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    w: innerWidth,
    h: innerHeight,
  }));
  console.log('B11 phone-port', JSON.stringify(state));
  // Chromium mobile emulation usually coarse or hover:none
  expect(state.w < state.h).toBe(true);
  expect(state.active).toBe(true);
  expect(state.display).toBe('flex');
  await ctx.close();
});

test('landscape phone: rotate-gate-active OFF', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  const active = await page.evaluate(() =>
    document.documentElement.classList.contains('rotate-gate-active'),
  );
  expect(active).toBe(false);
  await ctx.close();
});

test('desktop tall window 900×1200: gate OFF (fine pointer)', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 1200 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => ({
    active: document.documentElement.classList.contains('rotate-gate-active'),
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
  }));
  console.log('B11 desk-tall', JSON.stringify(state));
  expect(state.pointerCoarse).toBe(false);
  expect(state.active).toBe(false);
  await ctx.close();
});

test('iPad-sized portrait 1024×1366 + touch: gate ON', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => ({
    active: document.documentElement.classList.contains('rotate-gate-active'),
    resolved: document.documentElement.classList.contains('rotate-gate-resolved'),
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
  }));
  console.log('B11 ipad-port', JSON.stringify(state));
  expect(state.active).toBe(true);
  expect(state.resolved).toBe(true);
  await ctx.close();
});

test('after JS resolve, CSS FOUC belt is inert (steady-state = JS only)', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
    timeout: 60_000,
  });
  const probe = await page.evaluate(() => {
    const root = document.documentElement;
    const el = document.querySelector('#rotate-prompt') as HTMLElement;
    // Steady: resolved + active → flex
    const withActive = getComputedStyle(el).display;
    // Drop active while keeping resolved → CSS belt must NOT re-show
    root.classList.remove('rotate-gate-active');
    const resolvedOnly = getComputedStyle(el).display;
    // Simulate pre-JS: no resolved, no active → belt may show on coarse portrait
    root.classList.remove('rotate-gate-resolved');
    const preJs = getComputedStyle(el).display;
    return { withActive, resolvedOnly, preJs, coarse: matchMedia('(pointer: coarse)').matches };
  });
  console.log('B11 handoff', JSON.stringify(probe));
  expect(probe.withActive).toBe('flex');
  expect(probe.resolvedOnly).toBe('none');
  expect(probe.preJs).toBe('flex'); // CSS belt matches JS for this viewport
  await ctx.close();
});
