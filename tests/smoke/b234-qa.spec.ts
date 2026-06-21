/**
 * B2/B3/B4 live QA (卡卡西) — Gate-1 playable verification.
 *   B2 — 6 pocket discs render at sim POCKET_POSITIONS; sink clone appears on pocketing.
 *   B3 — 'T' / Top button tweens camera to POSE_TOP and back to POSE_TABLE; raycast intact.
 *   B4 — turn-prompt overlay present + correct player text; cue standby on turn change.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

async function goto(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}
async function clickPlay(page: Page) {
  const play = page.locator('button').filter({ hasText: /play|hotseat|start/i }).first();
  if (await play.count()) { await play.click().catch(() => {}); await page.waitForTimeout(900); }
}
async function cam(page: Page) {
  return page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as { camera: { position: { x: number; y: number; z: number } } } | undefined;
    const p = d?.camera.position; return p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } : null;
  });
}

test('B2 — 6 pocket discs render at sim positions', async ({ page }) => {
  await goto(page); await clickPlay(page);
  const probe = await page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as { scene: { traverse: (cb: (o: unknown) => void) => void } } | undefined;
    const discs: Array<{ x: number; z: number; r: number }> = [];
    d?.scene.traverse((o: unknown) => {
      const m = o as { geometry?: { type?: string; parameters?: { radius?: number } }; position?: { x: number; z: number } };
      if (m.geometry?.type === 'CircleGeometry' && m.position) {
        // pocket discs live in tableGroup at scene origin → local x/z == world x/z
        discs.push({ x: +m.position.x.toFixed(4), z: +m.position.z.toFixed(4), r: m.geometry.parameters?.radius ?? 0 });
      }
    });
    return discs;
  });
  console.log(`B2 pocket discs: ${JSON.stringify(probe)}`);
  // sim POCKET_POSITIONS/10000: corners ±1.2875,±0.651 ; sides 0,±0.71 ; radius 0.045
  expect(probe.length).toBe(6);
  const keys = new Set(probe.map(d => `${d.x},${d.z}`));
  expect(keys.size).toBe(6);
  for (const d of probe) expect(Math.abs(d.r - 0.045)).toBeLessThan(1e-6);
  const xs = probe.map(d => Math.abs(d.x)).sort((a, b) => a - b);
  expect(xs.filter(x => Math.abs(x - 1.2875) < 0.002).length).toBe(4); // 4 corner pockets
  expect(xs.filter(x => x < 0.002).length).toBe(2);                    // 2 side pockets x=0
});

test('B3 — top-view toggle moves camera to POSE_TOP and back', async ({ page }) => {
  await goto(page); await clickPlay(page);
  const table = await cam(page);                          // POSE_TABLE ~ [0,2.5,1.8]
  await page.keyboard.press('t');                          // → POSE_TOP
  await page.waitForTimeout(900);
  const top = await cam(page);
  await page.keyboard.press('t');                          // → back to POSE_TABLE
  await page.waitForTimeout(900);
  const back = await cam(page);
  console.log(`B3 camera table=${JSON.stringify(table)} top=${JSON.stringify(top)} back=${JSON.stringify(back)}`);
  expect(top!.y).toBeGreaterThan(table!.y + 1);            // moved up toward 5.0
  expect(Math.abs(top!.z)).toBeLessThan(0.6);             // near-overhead (POSE_TOP z=0.3)
  expect(Math.abs(back!.y - table!.y)).toBeLessThan(0.3); // restored to table view
  expect(Math.abs(back!.z - table!.z)).toBeLessThan(0.3);
});

test('B4 — turn-prompt overlay present + correct player text', async ({ page }) => {
  await goto(page); await clickPlay(page);
  // The prompt overlay is a pointer-events:none div; assert it exists and surfaces a player turn.
  const probe = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    const prompt = divs.find(d => /turn/i.test(d.textContent ?? '') && /drag|place|aim/i.test(d.textContent ?? ''));
    return prompt ? { found: true, text: prompt.textContent ?? '', display: getComputedStyle(prompt).display } : { found: false, text: '', display: '' };
  });
  console.log(`B4 turn-prompt: ${JSON.stringify(probe)}`);
  expect(probe.found).toBe(true);
  expect(/Player [12]/.test(probe.text)).toBe(true);
});

test('B2b — sink animation clone spawns when a ball is pocketed (live)', async ({ page }) => {
  await goto(page); await clickPlay(page);
  // Aim at rack and break at full power to pocket balls (SQ4-class).
  const cue = await page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as { camera: { projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } }; cueBallMesh: { position: { x: number; y: number; z: number } }; renderer: { domElement: HTMLCanvasElement } } | undefined;
    if (!d) return { x: 300, y: 300 };
    const { x, y, z } = d.cueBallMesh.position; const me = d.camera.matrixWorldInverse.elements, pe = d.camera.projectionMatrix.elements;
    const vx = me[0]*x+me[4]*y+me[8]*z+me[12], vy = me[1]*x+me[5]*y+me[9]*z+me[13], vz = me[2]*x+me[6]*y+me[10]*z+me[14], vw = me[3]*x+me[7]*y+me[11]*z+me[15];
    const cx = pe[0]*vx+pe[4]*vy+pe[8]*vz+pe[12]*vw, cy = pe[1]*vx+pe[5]*vy+pe[9]*vz+pe[13]*vw, cw = pe[3]*vx+pe[7]*vy+pe[11]*vz+pe[15]*vw;
    const rect = d.renderer.domElement.getBoundingClientRect();
    return { x: Math.round(rect.left + (cx/cw+1)/2*rect.width), y: Math.round(rect.top + (1-cy/cw)/2*rect.height) };
  });
  const ptr = (t: string, x: number, y: number, b = 1) => page.evaluate(({ t, x, y, b }) => { document.querySelector('canvas')?.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, buttons: b, pointerId: 1, pointerType: 'mouse', isPrimary: true })); }, { t, x, y, b });
  await ptr('pointerdown', cue.x, cue.y);
  for (let i = 1; i <= 8; i++) { await ptr('pointermove', cue.x + i * 15, cue.y); await page.waitForTimeout(15); }
  await ptr('pointerup', cue.x + 130, cue.y, 0); await page.waitForTimeout(100);
  const s = page.locator('input[type="range"]').first(); const bb = await s.boundingBox();
  await page.mouse.move(bb!.x + 4, bb!.y + bb!.height / 2); await page.mouse.down();
  await s.evaluate((el, p) => { (el as HTMLInputElement).value = String(p); el.dispatchEvent(new Event('input', { bubbles: true })); }, 100);
  await page.mouse.up(); await page.waitForTimeout(50);
  await page.locator('button').filter({ hasText: 'Shot' }).click();
  // Poll the scene for a transient transparent sphere clone (the sink animation) during replay.
  let maxClones = 0;
  for (let i = 0; i < 80; i++) {
    const n = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__poolDebug as { scene: { traverse: (cb: (o: unknown) => void) => void } } | undefined;
      let c = 0;
      d?.scene.traverse((o: unknown) => {
        const m = o as { geometry?: { type?: string }; material?: { transparent?: boolean; opacity?: number } };
        if (m.geometry?.type === 'SphereGeometry' && m.material?.transparent === true && (m.material.opacity ?? 1) < 1) c++;
      });
      return c;
    });
    if (n > maxClones) maxClones = n;
    await page.waitForTimeout(100);
  }
  console.log(`B2b max simultaneous sink clones observed during replay: ${maxClones}`);
  expect(maxClones).toBeGreaterThan(0);  // sink animation actually spawned a fading clone
});
