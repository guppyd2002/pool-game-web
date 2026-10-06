/**
 * Phase 1 #7a A-1′ — before/after anisotropy screenshots (top + orbit) + ΔL.
 * L = 0.2126R + 0.7152G + 0.0722B (sRGB 0–255 channels as used in canvas readback).
 * iPhone dpr=3 FPS: 未測 (no device).
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'phase1-7a');

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function waitProbe(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const w = window as unknown as { __layoutProbe?: { getAnisotropyReport: () => unknown } };
    return Boolean(w.__layoutProbe?.getAnisotropyReport);
  }, { timeout: 60000 });
  await page.waitForTimeout(800);
}

async function meanLInRect(
  page: import('@playwright/test').Page,
  rect: { x: number; y: number; w: number; h: number },
): Promise<number> {
  return page.evaluate(({ x, y, w, h }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return NaN;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // WebGL canvas — use drawImage bridge
      const bridge = document.createElement('canvas');
      bridge.width = canvas.width;
      bridge.height = canvas.height;
      const bctx = bridge.getContext('2d')!;
      bctx.drawImage(canvas, 0, 0);
      const data = bctx.getImageData(
        Math.round(x * (canvas.width / canvas.clientWidth)),
        Math.round(y * (canvas.height / canvas.clientHeight)),
        Math.max(1, Math.round(w * (canvas.width / canvas.clientWidth))),
        Math.max(1, Math.round(h * (canvas.height / canvas.clientHeight))),
      ).data;
      let s = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
      return n ? s / n : NaN;
    }
    return NaN;
  }, rect);
}

test.describe('Phase 1 #7a A-1′ anisotropy A/B', () => {
  test.setTimeout(120_000);

  test('top+orbit before/after; ΔL felt/ball ≤3%; anisotropy printed', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const viewport = { width: 1280, height: 720 };
    const results: Record<string, unknown> = {
      task: 'Phase 1 #7a A-1′',
      L_formula: 'L = 0.2126R + 0.7152G + 0.0722B (canvas sRGB 0–255)',
      fps_iphone_dpr3: '未測',
      note_top_view: 'Null visual delta on top is predicted — not a failure.',
    };

    async function capture(label: string, anisoOn: boolean) {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const q = anisoOn ? '' : '?tableAniso=0';
      await page.goto(`http://localhost:5173/layout-probe.html${q}`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await waitProbe(page);

      const report = await page.evaluate(() => {
        const w = window as unknown as {
          __layoutProbe: { getAnisotropyReport: () => unknown };
        };
        return w.__layoutProbe.getAnisotropyReport();
      });

      // Top view
      await page.evaluate(() => {
        (window as unknown as { __layoutProbe: { setOrthoTop: (v: boolean) => void } })
          .__layoutProbe.setOrthoTop(true);
      });
      await page.waitForTimeout(400);
      const topPath = path.join(OUT, `${label}-top.png`);
      await page.locator('#app canvas').screenshot({ path: topPath });

      // Orbit / overview-ish (look from above-side)
      await page.evaluate(() => {
        (window as unknown as {
          __layoutProbe: {
            setOrbitPose: (p: [number, number, number], l?: [number, number, number]) => void;
          };
        }).__layoutProbe.setOrbitPose([1.8, 1.4, 1.8], [0, 0, 0]);
      });
      await page.waitForTimeout(400);
      const orbitPath = path.join(OUT, `${label}-orbit.png`);
      await page.locator('#app canvas').screenshot({ path: orbitPath });

      // ROI ΔL on top view (felt centre + cue ball area approx)
      await page.evaluate(() => {
        (window as unknown as { __layoutProbe: { setOrthoTop: (v: boolean) => void } })
          .__layoutProbe.setOrthoTop(true);
      });
      await page.waitForTimeout(300);
      const feltL = await meanLInRect(page, { x: 560, y: 300, w: 80, h: 80 });
      const ballL = await meanLInRect(page, { x: 400, y: 340, w: 40, h: 40 });

      await ctx.close();
      return { report, topPath, orbitPath, feltL, ballL };
    }

    const before = await capture('before', false);
    const after = await capture('after', true);

    const dFelt =
      before.feltL && after.feltL
        ? (Math.abs(after.feltL - before.feltL) / Math.max(before.feltL, 1e-6)) * 100
        : NaN;
    const dBall =
      before.ballL && after.ballL
        ? (Math.abs(after.ballL - before.ballL) / Math.max(before.ballL, 1e-6)) * 100
        : NaN;

    results.before = {
      anisotropy: before.report,
      felt_L: before.feltL,
      ball_L: before.ballL,
      shots: [before.topPath, before.orbitPath],
    };
    results.after = {
      anisotropy: after.report,
      felt_L: after.feltL,
      ball_L: after.ballL,
      shots: [after.topPath, after.orbitPath],
    };
    results.delta = {
      felt_dL_pct: dFelt,
      ball_dL_pct: dBall,
      felt_pass: dFelt <= 3,
      ball_pass: dBall <= 3,
    };

    fs.writeFileSync(path.join(OUT, 'a1-prime-report.json'), JSON.stringify(results, null, 2));

    // Anisotropy applied on after
    const afterRep = after.report as {
      applied: boolean;
      maxAnisotropy: number;
      table: { anisotropySet: number }[];
    };
    expect(afterRep.applied).toBe(true);
    expect(afterRep.table.length).toBeGreaterThanOrEqual(1);
    expect(afterRep.table.every((t) => t.anisotropySet >= 1)).toBe(true);

    // ΔL gates (separate felt / ball)
    expect(dFelt).toBeLessThanOrEqual(3);
    expect(dBall).toBeLessThanOrEqual(3);

    // Screenshots exist
    for (const p of [before.topPath, before.orbitPath, after.topPath, after.orbitPath]) {
      expect(fs.existsSync(p)).toBe(true);
    }
  });
});
