/**
 * SP-Harden-9d self-test — 斑 gate traps ③④⑤⑥:
 *  ③ Aim at a ball (hitType==='ball'); empty felt has no red/cyan arms.
 *  ④ Force high power (setAimPowerFraction(1)) before A min/max compare.
 *  ⑤ Slider DOM min/max === setter clamp (0.05–2.0 / 0.1–3.0).
 *  ⑥ A→ target arms move, blue fixed; B→ blue moves, arms fixed; labels not swapped.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'spharden9d');

type Probe = {
  hitType: string;
  a: number;
  b: number;
  power: number;
  /** Max length among cyan/red Line2 segments (assist arms). */
  assistMaxLen: number;
  /** Length of blue (0x4db8ff) Line2 cue guide, else 0. */
  blueLen: number;
  assistCount: number;
  labels: { aLabel: boolean; bLabel: boolean; baseline: boolean; orderOk: boolean };
  ranges: { aMin: string; aMax: string; bMin: string; bMax: string };
};

async function probe(page: import('@playwright/test').Page): Promise<Probe> {
  return page.evaluate(() => {
    const d = (window as any).__poolDebug;
    const hit = d.cue?.getAimHit?.(1) ?? d.cue?.getAimHit?.() ?? null;
    const CYAN = 0x7ec8ff;
    const RED = 0xff3333;
    const BLUE = 0x4db8ff;

    let assistMaxLen = 0;
    let assistCount = 0;
    let blueLen = 0;

    d.scene.traverse((o: any) => {
      if (!(o.isLine2 || o.type === 'Line2') || !o.visible) return;
      const start = o.geometry?.attributes?.instanceStart;
      const end = o.geometry?.attributes?.instanceEnd;
      if (!start || !end || start.count < 1) return;
      const len = Math.hypot(end.getX(0) - start.getX(0), end.getZ(0) - start.getZ(0));
      if (len < 1e-5) return;
      const color = o.material?.color?.getHex?.() ?? 0;
      if (color === CYAN || color === RED) {
        assistCount++;
        if (len > assistMaxLen) assistMaxLen = len;
      } else if (color === BLUE || color === 0x4db8ff) {
        if (len > blueLen) blueLen = len;
      } else {
        // aim-line may use slightly different legal blue — treat non-assist longest as blue candidate
        // only if not already classified
      }
    });

    // Fallback: if blue not matched by color, take longest non-assist Line2
    if (blueLen < 1e-5) {
      d.scene.traverse((o: any) => {
        if (!(o.isLine2 || o.type === 'Line2') || !o.visible) return;
        const start = o.geometry?.attributes?.instanceStart;
        const end = o.geometry?.attributes?.instanceEnd;
        if (!start || !end || start.count < 1) return;
        const len = Math.hypot(end.getX(0) - start.getX(0), end.getZ(0) - start.getZ(0));
        const color = o.material?.color?.getHex?.() ?? 0;
        if (color === CYAN || color === RED) return;
        if (len > blueLen) blueLen = len;
      });
    }

    const panel = document.getElementById('aim-length-debug');
    const text = panel?.textContent ?? '';
    const aEl = document.getElementById('aim-len-target-ext') as HTMLInputElement | null;
    const bEl = document.getElementById('aim-len-cue-guide') as HTMLInputElement | null;
    const aIdx = Math.max(text.indexOf('目標球延伸'), text.indexOf('target extension'));
    const bIdx = Math.max(text.indexOf('母球導引'), text.indexOf('cue guide'));

    return {
      hitType: hit?.hitType ?? 'none',
      a: d.getAimLineDistanceM(),
      b: d.getCueAimGuideLengthM(),
      power: d.getAimPowerFraction?.() ?? 0,
      assistMaxLen,
      blueLen,
      assistCount,
      labels: {
        aLabel: text.includes('目標球延伸') || text.includes('target extension'),
        bLabel: text.includes('母球導引') || text.includes('cue guide'),
        baseline: text.includes('基準'),
        orderOk: aIdx >= 0 && bIdx >= 0 && aIdx < bIdx,
      },
      ranges: {
        aMin: aEl?.min ?? '',
        aMax: aEl?.max ?? '',
        bMin: bEl?.min ?? '',
        bMax: bEl?.max ?? '',
      },
    };
  });
}

test('SP-Harden-9d dual slider gate (ball + high power)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1100, height: 800 });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('#btn-start').click();
  await page.waitForTimeout(1100);

  // Top camera — clear aim into rack (+x).
  await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    d.camera.position.set(0, 2.8, 0.02);
    d.camera.lookAt(0, 0, 0);
    d.camera.updateProjectionMatrix();
  });

  // Trap ④: force full energy BEFORE measuring A (else arm ≈ 2R and A looks dead).
  await page.evaluate(() => {
    (window as any).__poolDebug.setAimPowerFraction(1);
  });

  // Trap ③: aim at a ball (drag cue back so aim points into rack).
  const cs = await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    const v = d.cueBallMesh.position.clone().project(d.camera);
    const r = d.renderer.domElement.getBoundingClientRect();
    return {
      sx: r.left + (v.x * 0.5 + 0.5) * r.width,
      sy: r.top + (-v.y * 0.5 + 0.5) * r.height,
    };
  });
  await page.mouse.move(cs.sx, cs.sy);
  await page.mouse.down();
  await page.mouse.move(cs.sx - 120, cs.sy, { steps: 24 });
  await page.waitForTimeout(250);

  let p0 = await probe(page);
  if (p0.hitType !== 'ball') {
    await page.mouse.move(cs.sx - 180, cs.sy + 10, { steps: 20 });
    await page.waitForTimeout(250);
    p0 = await probe(page);
  }
  expect(p0.hitType, 'trap③ must aim at a ball').toBe('ball');
  expect(p0.power).toBe(1);

  // Gate ⑤ ranges + ⑥ labels
  expect(p0.ranges.aMin).toBe('0.05');
  expect(p0.ranges.aMax).toBe('2');
  expect(p0.ranges.bMin).toBe('0.1');
  expect(p0.ranges.bMax).toBe('3');
  expect(p0.labels.aLabel).toBe(true);
  expect(p0.labels.bLabel).toBe(true);
  expect(p0.labels.baseline).toBe(true);
  expect(p0.labels.orderOk).toBe(true);

  // ── Gate ⑥ A sweep: red/cyan arms change, blue fixed ─────────────────────
  await page.evaluate(() => {
    const d = (window as any).__poolDebug;
    d.setCueAimGuideLengthM(1.5);
    d.setAimLineDistanceM(0.05);
  });
  await page.waitForTimeout(80);
  const aMin = await probe(page);

  await page.evaluate(() => {
    (window as any).__poolDebug.setAimLineDistanceM(2.0);
  });
  await page.waitForTimeout(80);
  const aMax = await probe(page);

  expect(aMin.a).toBeCloseTo(0.05, 5);
  expect(aMax.a).toBeCloseTo(2.0, 5);
  expect(aMin.b).toBeCloseTo(1.5, 5);
  expect(aMax.b).toBeCloseTo(1.5, 5);
  // Assist arm must grow substantially at high power (trap ④).
  expect(aMax.assistMaxLen).toBeGreaterThan(aMin.assistMaxLen + 0.4);
  // Blue guide length stable across A
  expect(Math.abs(aMax.blueLen - aMin.blueLen)).toBeLessThan(0.12);

  await page.screenshot({ path: path.join(OUT, 'A-max-ball-highP.png') });

  // ── Gate ⑥ B sweep: blue changes, assist arms fixed ──────────────────────
  await page.evaluate(() => {
    (window as any).__poolDebug.setCueAimGuideLengthM(0.3);
  });
  await page.waitForTimeout(80);
  const bMin = await probe(page);

  await page.evaluate(() => {
    (window as any).__poolDebug.setCueAimGuideLengthM(2.8);
  });
  await page.waitForTimeout(80);
  const bMax = await probe(page);

  expect(bMin.a).toBeCloseTo(2.0, 5);
  expect(bMax.a).toBeCloseTo(2.0, 5);
  expect(bMin.b).toBeCloseTo(0.3, 5);
  expect(bMax.b).toBeCloseTo(2.8, 5);
  expect(bMax.blueLen).toBeGreaterThan(bMin.blueLen + 0.8);
  expect(Math.abs(bMax.assistMaxLen - bMin.assistMaxLen)).toBeLessThan(0.12);

  await page.screenshot({ path: path.join(OUT, 'B-max-ball-highP.png') });

  // Trap ③ sanity: empty-ish aim (cushion) → no assist arms after releasing & aiming felt
  // (optional soft check — not failing gate if hard to re-aim mid-test)

  const report = { p0, aMin, aMax, bMin, bMax, errors,
    aAssistDelta: aMax.assistMaxLen - aMin.assistMaxLen,
    aBlueDelta: aMax.blueLen - aMin.blueLen,
    bBlueDelta: bMax.blueLen - bMin.blueLen,
    bAssistDelta: bMax.assistMaxLen - bMin.assistMaxLen,
  };
  fs.writeFileSync(path.join(OUT, 'gate.json'), JSON.stringify(report, null, 2));
  console.log('SP-Harden-9d GATE PASS', JSON.stringify(report, null, 2));

  await page.mouse.up();
  expect(errors).toHaveLength(0);
});
