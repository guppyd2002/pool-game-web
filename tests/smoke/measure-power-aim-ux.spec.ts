/**
 * #3 Power/Spin + #5 Aim-line measurement tables (綱手 P0).
 *
 * ⚠️ NON-REAL-DEVICE — Playwright viewport simulation only.
 * Real-device follow-up: 卡卡西 / CEO devices (separate table).
 *
 * Rules: getBoundingClientRect for DOM; Aim Line2 material via scene walk
 * (WebGL fat-line has no DOM box). Record devicePixelRatio + userAgent.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'ux-measure-playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

/** 8BP static benchmark from challenge #045 / design docs (not measured this run). */
const BP8 = {
  power: {
    side: 'LEFT',
    widthPctVw: 3.0,
    heightPctVh: 50.8,
    note: 'static hypothesis from challenge #045 — not re-measured vs live 8BP app',
  },
  spin: {
    side: 'RIGHT-TOP',
    note: '8BP Spin top-right per challenge #045 H1',
  },
  aim: {
    widthPx: 2,
    color: '#ffffff',
    opacity: 1,
    stroke: 'near-black ~1px',
    note: 'static 8BP vs our Line2 (no dual stroke)',
  },
};

type Vp = {
  name: string;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait';
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
  userAgent?: string;
};

const VIEWPORTS: Vp[] = [
  {
    name: 'iPhone-14-land',
    width: 844,
    height: 390,
    orientation: 'landscape',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone-14-port',
    width: 390,
    height: 844,
    orientation: 'portrait',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPad-land',
    width: 1024,
    height: 768,
    orientation: 'landscape',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPad-port',
    width: 768,
    height: 1024,
    orientation: 'portrait',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPad-Pro-port-1024',
    width: 1024,
    height: 1366,
    orientation: 'portrait',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'Desktop-Chrome-land',
    width: 1280,
    height: 720,
    orientation: 'landscape',
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
];

/** Capture rotate-gate state on the menu (before match). Fixed elements: use CSS + matchMedia. */
async function readRotatePrompt(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rotate = document.querySelector('#rotate-prompt') as HTMLElement | null;
    const cssShown = !!rotate && getComputedStyle(rotate).display !== 'none';
    const mq = window.matchMedia(
      'screen and (orientation: portrait) and (max-width: 900px)',
    ).matches;
    return { cssShown, mq, shown: cssShown || mq };
  });
}

test('UX measure #3 power/spin + #5 aim across viewports (Playwright, non-device)', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });

  const rows: unknown[] = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      deviceScaleFactor: vp.deviceScaleFactor,
      ...(vp.userAgent ? { userAgent: vp.userAgent } : {}),
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as unknown as { __poolDebug?: unknown }).__poolDebug, null, {
      timeout: 60_000,
    });
    const rotateOnMenu = await readRotatePrompt(page);
    await page.evaluate(() => {
      (document.querySelector('#btn-start') as HTMLButtonElement).click();
    });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.power-slider-overlay') as HTMLElement | null;
        return !!el && getComputedStyle(el).display === 'block' && el.getBoundingClientRect().width > 0;
      },
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(300);

    // Nudge aim so Line2 is built/visible (assist default ON).
    await page.evaluate(() => {
      const d = (window as unknown as { __poolDebug: {
        cueBallMesh: { position: { clone: () => { x: number; y: number; z: number; project: (c: unknown) => { x: number; y: number } } } };
        camera: unknown;
        renderer: { domElement: HTMLElement };
        cue: { fireNow?: (f: number) => void };
      } }).__poolDebug;
      const v = d.cueBallMesh.position.clone().project(d.camera);
      const r = d.renderer.domElement.getBoundingClientRect();
      const sx = r.left + (v.x * 0.5 + 0.5) * r.width;
      const sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
      const cv = d.renderer.domElement;
      cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: sx, clientY: sy, bubbles: true }));
      cv.dispatchEvent(new PointerEvent('pointermove', { clientX: sx + 60, clientY: sy, bubbles: true }));
      // leave pointer down state cleaned
      cv.dispatchEvent(new PointerEvent('pointerup', { clientX: sx + 60, clientY: sy, bubbles: true }));
    });
    await page.waitForTimeout(200);

    const measured = await page.evaluate(({ bp8 }) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pack = (el: Element | null) => {
        if (!el) return null;
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          leftPx: +r.left.toFixed(2),
          rightPx: +r.right.toFixed(2),
          topPx: +r.top.toFixed(2),
          bottomPx: +r.bottom.toFixed(2),
          widthPx: +r.width.toFixed(2),
          heightPx: +r.height.toFixed(2),
          leftPctVw: +((r.left / vw) * 100).toFixed(2),
          rightPctVw: +((r.right / vw) * 100).toFixed(2),
          widthPctVw: +((r.width / vw) * 100).toFixed(2),
          heightPctVh: +((r.height / vh) * 100).toFixed(2),
          side: r.left + r.width / 2 < vw / 2 ? 'LEFT' : 'RIGHT',
          display: getComputedStyle(el as HTMLElement).display,
          opacity: getComputedStyle(el as HTMLElement).opacity,
        };
      };

      const power = document.querySelector('.power-slider-overlay');
      const spin = document.querySelector('.spin-disc-overlay');

      // Aim = WebGL Line2 — no DOM rect. Walk scene for LineMaterial on Line2.
      const dbg = (window as unknown as { __poolDebug: { scene: { traverse: (fn: (o: unknown) => void) => void } } })
        .__poolDebug;
      const aimMats: Array<{
        linewidth: number;
        opacity: number;
        colorHex: string;
        transparent: boolean;
        visible: boolean;
      }> = [];
      dbg.scene.traverse((o: unknown) => {
        const obj = o as {
          isLine2?: boolean;
          visible?: boolean;
          material?: {
            linewidth?: number;
            opacity?: number;
            transparent?: boolean;
            color?: { getHexString: () => string };
          };
        };
        if (!obj?.isLine2 || !obj.material) return;
        const m = obj.material;
        if (typeof m.linewidth !== 'number') return;
        aimMats.push({
          linewidth: m.linewidth,
          opacity: m.opacity ?? 1,
          colorHex: m.color ? `#${m.color.getHexString()}` : 'unknown',
          transparent: !!m.transparent,
          visible: !!obj.visible,
        });
      });

      // Prefer visible aim guide (cue blue line ~2.5) over assist arms (3.0).
      const aimVisible = aimMats.filter((a) => a.visible);
      const aimPick =
        aimVisible.find((a) => Math.abs(a.linewidth - 2.5) < 0.01) ??
        aimVisible[0] ??
        aimMats.find((a) => Math.abs(a.linewidth - 2.5) < 0.01) ??
        aimMats[0] ??
        null;

      return {
        method: 'NON-REAL-DEVICE Playwright viewport; DOM=getBoundingClientRect; aim=Line2.material',
        viewport: { innerWidth: vw, innerHeight: vh },
        devicePixelRatio: window.devicePixelRatio,
        userAgent: navigator.userAgent,
        power: pack(power),
        spin: pack(spin),
        aim: aimPick
          ? {
              linewidthPx: aimPick.linewidth,
              color: aimPick.colorHex,
              opacity: aimPick.opacity,
              transparent: aimPick.transparent,
              stroke: 'none (single Line2; no near-black dual stroke)',
              visible: aimPick.visible,
              allLine2Count: aimMats.length,
              visibleLine2Count: aimVisible.length,
            }
          : null,
        bp8Compare: bp8,
      };
    }, { bp8: BP8 });

    rows.push({
      device: vp.name,
      orientation: vp.orientation,
      configuredViewport: { w: vp.width, h: vp.height },
      configuredDpr: vp.deviceScaleFactor,
      configuredUserAgent: vp.userAgent ?? '(Playwright Desktop Chrome default)',
      ...measured,
      rotatePromptOnMenu: rotateOnMenu,
      rotatePromptShown: rotateOnMenu.shown,
    });

    await page.screenshot({
      path: path.join(OUT, `${vp.name}.png`),
      fullPage: true,
    });
    await ctx.close();
  }

  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(rows, null, 2));

  // Markdown tables for fleet report
  const md: string[] = [];
  md.push('# UX measure #3 / #5 — Playwright (NON-REAL-DEVICE)');
  md.push('');
  md.push('Method: `getBoundingClientRect` for Power/Spin DOM; Aim via Three.js `Line2.material` (no DOM box).');
  md.push('8BP column = static benchmark from challenge #045 (not live-measured 8BP).');
  md.push('');
  md.push('## #3 Power / Spin');
  md.push('');
  md.push(
    '| Device | Orient | DPR | UA (short) | RotatePrompt | Power side | Power left px / %VW | Power right %VW | Power W×H px | Power W%VW×H%VH | 8BP Power | Spin side | Spin left %VW | Spin W×H px | 8BP Spin |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const raw of rows) {
    const r = raw as {
      device: string;
      orientation: string;
      devicePixelRatio: number;
      userAgent: string;
      rotatePromptShown: boolean;
      power: null | {
        side: string;
        leftPx: number;
        leftPctVw: number;
        rightPctVw: number;
        widthPx: number;
        heightPx: number;
        widthPctVw: number;
        heightPctVh: number;
      };
      spin: null | {
        side: string;
        leftPctVw: number;
        widthPx: number;
        heightPx: number;
      };
    };
    const uaShort = (r.userAgent || '').slice(0, 48).replace(/\|/g, '/');
    const p = r.power;
    const s = r.spin;
    md.push(
      `| ${r.device} | ${r.orientation} | ${r.devicePixelRatio} | ${uaShort}… | ${r.rotatePromptShown} | ${p?.side ?? '—'} | ${p ? `${p.leftPx} / ${p.leftPctVw}%` : '—'} | ${p?.rightPctVw ?? '—'}% | ${p ? `${p.widthPx}×${p.heightPx}` : '—'} | ${p ? `${p.widthPctVw}%×${p.heightPctVh}%` : '—'} | LEFT · 3.0%W×50.8%H | ${s?.side ?? '—'} | ${s?.leftPctVw ?? '—'}% | ${s ? `${s.widthPx}×${s.heightPx}` : '—'} | RIGHT-TOP |`,
    );
  }
  md.push('');
  md.push('## #5 Aim line');
  md.push('');
  md.push(
    '| Device | Orient | DPR | linewidth px | color | opacity | stroke | visible | 8BP Aim |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const raw of rows) {
    const r = raw as {
      device: string;
      orientation: string;
      devicePixelRatio: number;
      aim: null | {
        linewidthPx: number;
        color: string;
        opacity: number;
        stroke: string;
        visible: boolean;
      };
    };
    const a = r.aim;
    md.push(
      `| ${r.device} | ${r.orientation} | ${r.devicePixelRatio} | ${a?.linewidthPx ?? '—'} | ${a?.color ?? '—'} | ${a?.opacity ?? '—'} | ${a?.stroke ?? '—'} | ${a?.visible ?? '—'} | 2px · #ffffff · opacity~1 · near-black ~1px stroke |`,
    );
  }
  md.push('');
  md.push('## Meta');
  md.push(`- Generated: ${new Date().toISOString()}`);
  md.push('- Source: tests/smoke/measure-power-aim-ux.spec.ts');
  md.push('- Artifact JSON: tests/smoke/screenshots/ux-measure-playwright/measure.json');

  fs.writeFileSync(path.join(OUT, 'measure.md'), md.join('\n'));
  console.log(md.join('\n'));

  expect(rows.length).toBe(VIEWPORTS.length);
  // At least landscape phone should expose power overlay with a rect
  const phoneLand = rows.find((x) => (x as { device: string }).device === 'iPhone-14-land') as {
    power: { widthPx: number } | null;
  };
  expect(phoneLand?.power?.widthPx, 'power overlay measured on iPhone landscape').toBeGreaterThan(0);
});
