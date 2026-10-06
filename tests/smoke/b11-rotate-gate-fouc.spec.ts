/**
 * B-11 FOUC probe (千手 #2): navigationStart → html.rotate-gate-active under
 * throttled mobile (Fast 3G + CPU 4×). Report ms + commit via console.
 *
 * NOT a pass/fail product gate — measurement for CSS-insurance decision.
 */
import { test } from '@playwright/test';
import { execSync } from 'child_process';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

function gitHead(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

test('measure FOUC: navStart → rotate-gate-active (Fast 3G + CPU 4×)', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  // Chromium Network emulation: Slow 3G is harsher; "Fast 3G" ≈ 1.6Mbps down / 750kbps up / 150ms RTT
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: 'cellular3g',
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Cold-ish: disable cache for this document
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.goto(BASE + '/', { waitUntil: 'commit' });
  // Wait until gate class applied (JS installRotateGate ran)
  await page.waitForFunction(
    () => document.documentElement.classList.contains('rotate-gate-active'),
    null,
    { timeout: 120_000 },
  );

  const ms = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const start = nav?.startTime != null
      ? performance.timeOrigin + nav.startTime
      : performance.timing?.navigationStart ?? performance.timeOrigin;
    // Class apply time ≈ now when waitForFunction resolved; refine with PerformanceObserver if marked.
    const applied = performance.now();
    const navStartOffset = nav?.startTime ?? 0;
    return {
      msFromNavStart: +(applied - navStartOffset).toFixed(1),
      navigationType: nav?.type ?? null,
      transferSize: nav?.transferSize ?? null,
      domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
      dpr: devicePixelRatio,
      vw: innerWidth,
      vh: innerHeight,
    };
  });

  const head = gitHead();
  const payload = {
    commit: head,
    profile: 'Fast3G(1.6Mbps/750kbps/150msRTT)+CPU4x+cacheDisabled',
    viewport: '390×844 isMobile hasTouch',
    ...ms,
  };
  console.log('B11_FOUC_MEASURE', JSON.stringify(payload));
  // Soft bound — always log; fail only if absurdly never applied (waitForFunction would throw)
  await ctx.close();
});
