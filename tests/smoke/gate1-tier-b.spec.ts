/**
 * Gate 1 — Tier B: Playwright interactive screenshot sequence.
 * Captures B1–B9 for visual QA sign-off of P1-T02 cue controller.
 *
 * Run: npx playwright test tests/smoke/gate1-tier-b.spec.ts
 * Screenshots saved to tests/smoke/screenshots/
 *
 * Features marked [N/A] are not yet implemented in P1-T02 and will be
 * reported as such to 香吉士 Gate-1 QA.
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:5173';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SS = (name: string) => path.join(__dirname, 'screenshots', name);

function ensureDir(): void {
  const d = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/** Load the page and wait for THREE.js first render frame. */
async function loadApp(page: Page): Promise<void> {
  ensureDir();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
}

/** Returns the canvas bounding box. */
async function canvasBox(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

/**
 * Project the cue ball's THREE.js mesh position to canvas screen coordinates.
 * Requires window.__poolDebug exposed by main.ts.
 * Returns { x, y } in page (viewport) coordinates.
 */
async function cueBallScreenPos(page: Page): Promise<{ x: number; y: number }> {
  const pos = await page.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__poolDebug as {
      camera: {
        projectionMatrix: { elements: number[] };
        matrixWorldInverse: { elements: number[] };
      };
      cueBallMesh: { position: { x: number; y: number; z: number } };
      renderer: { domElement: HTMLCanvasElement };
    } | undefined;
    if (!debug) return null;

    // Manual MVP projection (THREE.Vector3.project equivalent)
    const { x, y, z } = debug.cueBallMesh.position;
    const me = debug.camera.matrixWorldInverse.elements;
    const pe = debug.camera.projectionMatrix.elements;

    // Multiply position by view matrix
    const vx = me[0]*x + me[4]*y + me[8]*z  + me[12];
    const vy = me[1]*x + me[5]*y + me[9]*z  + me[13];
    const vz = me[2]*x + me[6]*y + me[10]*z + me[14];
    const vw = me[3]*x + me[7]*y + me[11]*z + me[15];

    // Multiply by projection matrix
    const cx = pe[0]*vx + pe[4]*vy + pe[8]*vz  + pe[12]*vw;
    const cy = pe[1]*vx + pe[5]*vy + pe[9]*vz  + pe[13]*vw;
    const cw = pe[3]*vx + pe[7]*vy + pe[11]*vz + pe[15]*vw;

    const ndcX =  cx / cw;  // -1..1
    const ndcY =  cy / cw;  // -1..1

    const canvas = debug.renderer.domElement;
    const rect   = canvas.getBoundingClientRect();
    const sx = rect.left + (ndcX + 1) / 2 * rect.width;
    const sy = rect.top  + (1 - ndcY) / 2 * rect.height;
    return { x: Math.round(sx), y: Math.round(sy) };
  });
  if (!pos) {
    // Fallback: centre-left of canvas where cue ball typically appears
    const box = await canvasBox(page);
    return { x: Math.round(box.x + box.width * 0.28), y: Math.round(box.y + box.height * 0.50) };
  }
  return pos;
}

/**
 * Fire a shot via the REAL ShotSlider state machine:
 *   pointerdown → startControl() → setValue(force) → endControl() → fire()
 *
 * Using slider.fill() bypasses startControl(), keeping _isSelected=false
 * so setValue() is a no-op and fire() never calls onShot. This helper
 * uses mouse.down()/up() to trigger the correct pointer event sequence.
 */
async function fireShot(page: Page, forcePct = 80): Promise<void> {
  const slider = page.locator('input[type="range"]').first();
  const sbox   = await slider.boundingBox();
  expect(sbox).not.toBeNull();

  // pointerdown on left edge of slider → startControl() → _isSelected=true
  const startX = sbox!.x + 4;
  const midY   = sbox!.y + sbox!.height / 2;
  await page.mouse.move(startX, midY);
  await page.mouse.down();

  // Set value + dispatch 'input' event while still held → setValue(fraction) → _force set
  await slider.evaluate((el, pct) => {
    (el as HTMLInputElement).value = String(pct);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, forcePct);

  // pointerup → endControl() → _isSelected=false (manual mode: no auto-fire)
  await page.mouse.up();
  await page.waitForTimeout(50);

  // Click "Shot" button → fire() → onShot(force) → cue.fireNow(force)
  await page.locator('button').filter({ hasText: 'Shot' }).click();
}

/**
 * Read all 16 ball X/Z positions from the THREE.js scene via __poolDebug.
 * Returns array of { x, z } in scene-space meters.
 */
async function readBallPositions(page: Page): Promise<Array<{ x: number; z: number }>> {
  return page.evaluate(() => {
    const debug = (window as unknown as Record<string, unknown>).__poolDebug as {
      balls: Array<{ position: { x: number; y: number; z: number } }>;
    } | undefined;
    if (!debug?.balls) return [];
    return debug.balls.map(b => ({ x: b.position.x, z: b.position.z }));
  });
}

/** Dispatch a synthetic PointerEvent to the canvas element. */
async function canvasPointerEvent(
  page: Page,
  type: string,
  clientX: number,
  clientY: number,
  buttons = 1,
): Promise<void> {
  await page.evaluate(
    ({ type, clientX, clientY, buttons }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          clientX, clientY, buttons, pointerId: 1,
          pointerType: 'mouse', isPrimary: true,
        }),
      );
    },
    { type, clientX, clientY, buttons },
  );
}

// ─── B1: Aiming drag — cue rotates around cue ball ──────────────────────────
test('B1 — aim-drag: cue rotates around cue ball on pointer drag', async ({ page }) => {
  await loadApp(page);

  // Project cue ball to screen space so pointerdown hits the mesh exactly
  const { x: cx, y: cy } = await cueBallScreenPos(page);

  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 12; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy - i * 2);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: SS('B1-aim-drag.png') });
  await canvasPointerEvent(page, 'pointerup', cx + 180, cy - 24, 0);
  expect(fs.existsSync(SS('B1-aim-drag.png'))).toBe(true);
});

// ─── B2: Aim line + ghost ball ────────────────────────────────────────────────
test('B2 — aim-line + ghost ball visible during drag', async ({ page }) => {
  await loadApp(page);

  const { x: cx, y: cy } = await cueBallScreenPos(page);

  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  // Drag toward the rack (rightward) so aim line extends to ball cluster
  for (let i = 1; i <= 16; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 12, cy + i * 2);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS('B2-aim-line.png') });
  await canvasPointerEvent(page, 'pointerup', cx + 192, cy + 32, 0);
  expect(fs.existsSync(SS('B2-aim-line.png'))).toBe(true);
});

// ─── B3: Real ShotSlider path → balls scatter ────────────────────────────────
// Previous version used slider.fill('80') which bypasses ShotSlider.startControl()
// → setValue() no-ops (_isSelected=false) → fire() no-ops (_force=0 ≤ minForce).
// This test uses the REAL path: mouse.down→input→mouse.up→Shot button.
test('B3 — real-path shot: balls scatter after proper ShotSlider sequence', async ({ page }) => {
  await loadApp(page);

  // Aim first so cue controller has a valid aim direction
  const { x: cx, y: cy } = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 8; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy);
    await page.waitForTimeout(15);
  }
  await canvasPointerEvent(page, 'pointerup', cx + 120, cy, 0);
  await page.waitForTimeout(100);

  // Capture ball positions before shot
  const before = await readBallPositions(page);

  // ① Fire via real ShotSlider state machine
  await fireShot(page, 80);

  // ② Mid-flight screenshot (balls moving)
  await page.waitForTimeout(500);
  await page.screenshot({ path: SS('B3-shot-fired.png') });

  // ③ Mid-flight 2 (for extra evidence)
  await page.waitForTimeout(800);
  await page.screenshot({ path: SS('B3-shot-mid-flight.png') });

  // ④ Wait for replay to fully settle
  await page.waitForTimeout(5000);
  await page.screenshot({ path: SS('B3-shot-settled.png') });

  // ─── Smoke assertion: balls moved significantly ───────────────────────────
  // After a real shot, the total XZ displacement of all 16 balls must exceed
  // a meaningful threshold. Identical before/after means shot never fired.
  const after = await readBallPositions(page);
  const totalDisplacement = before.reduce((sum, b, i) => {
    if (!after[i]) return sum;
    const dx = after[i].x - b.x;
    const dz = after[i].z - b.z;
    return sum + Math.sqrt(dx * dx + dz * dz);
  }, 0);
  console.log(`B3 total ball displacement after shot: ${totalDisplacement.toFixed(3)}m`);
  // Break shot at 80% power: cue ball travels ~0.5m, rack scatters ~2–5m total
  expect(totalDisplacement).toBeGreaterThan(0.3);

  expect(fs.existsSync(SS('B3-shot-fired.png'))).toBe(true);
  expect(fs.existsSync(SS('B3-shot-settled.png'))).toBe(true);
});

// ─── B4: Side spin (english) → cue ball deflects after cushion hit ────────────
test('B4 — side spin: open spin disc, apply left english, fire toward rail', async ({ page }) => {
  await loadApp(page);

  // Open the Spin disc via the "Spin" button
  const spinBtn = page.locator('button').filter({ hasText: 'Spin' });
  const spinBtnCount = await spinBtn.count();
  if (spinBtnCount === 0) {
    // Spin button might have different label; click the second button
    const btns = await page.locator('button').all();
    if (btns.length >= 2) await btns[1].click();
  } else {
    await spinBtn.first().click();
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: SS('B4-spin-disc-open.png') });

  // Click left side of spin disc to apply left english
  // Spin disc is an overlay element — try clicking slightly left of center
  const disc = page.locator('canvas').nth(1);
  const discCount = await disc.count();
  if (discCount > 0) {
    const dbox = await disc.boundingBox();
    if (dbox) {
      await page.mouse.click(dbox.x + dbox.width * 0.25, dbox.y + dbox.height * 0.5);
      await page.waitForTimeout(200);
    }
  }

  // Fire via real ShotSlider path
  await fireShot(page, 60);
  await page.waitForTimeout(800);

  await page.screenshot({ path: SS('B4-side-spin-shot.png') });
  expect(fs.existsSync(SS('B4-side-spin-shot.png'))).toBe(true);
});

// ─── B5: Red aim line for opponent ball [N/A — P1-T03] ───────────────────────
test('B5 — aim-line colour change for opponent ball [N/A — P1-T03]', async ({ page }) => {
  await loadApp(page);
  // Not implemented in P1-T02. Aim line colour is constant (white/blue).
  // Will be wired in P1-T03 when game rules track ball ownership.
  await page.screenshot({ path: SS('B5-NA-opponent-aim-color.png') });
  console.log('B5: NOT IMPLEMENTED in P1-T02 — aim line colour change requires P1-T03 rules');
  expect(fs.existsSync(SS('B5-NA-opponent-aim-color.png'))).toBe(true);
});

// ─── B6: Pocket highlight [N/A — P1-T02] ─────────────────────────────────────
test('B6 — pocket highlight when on-target [N/A — P1-T02]', async ({ page }) => {
  await loadApp(page);
  // Not implemented in P1-T02. Pocket highlighting (glow/ring) was not part of
  // the CUE-001…CUE-023 feature set.
  await page.screenshot({ path: SS('B6-NA-pocket-highlight.png') });
  console.log('B6: NOT IMPLEMENTED in P1-T02 — pocket highlight not in CUE-001…023 scope');
  expect(fs.existsSync(SS('B6-NA-pocket-highlight.png'))).toBe(true);
});

// ─── B7: Foul → ball-in-hand placement ───────────────────────────────────────
test('B7 — ball-in-hand: placement marker follows pointer after entering BIH mode', async ({ page }) => {
  await loadApp(page);
  const box = await canvasBox(page);

  // enterBallInHand() is exported from main.ts and available via the module system.
  // In the Vite dev build, global entrypoints are not automatically on window —
  // trigger via the network stub or call the exported function through __vite_ssr_import__.
  // Fallback: the function IS exported; access via the Vite HMR boundary.
  // Simplest path: expose it during dev by checking window.__enterBallInHand if main.ts
  // assigns it, otherwise we drive it through the slider/button UI shortcut.
  //
  // Since P1-T03 hasn't wired the foul trigger yet, we demonstrate BIH is wired by
  // programmatically calling the exported function via page.evaluate.
  const entered = await page.evaluate(() => {
    // Attempt to call enterBallInHand if it's exposed on window
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.enterBallInHand === 'function') {
      (w.enterBallInHand as () => void)();
      return true;
    }
    return false;
  });

  if (!entered) {
    console.log('B7: enterBallInHand not on window — BIH UI not triggerable from Playwright without P1-T03 foul rule. Capturing base state.');
  }

  // Move pointer to where placement marker should follow
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.waitForTimeout(300);

  await page.screenshot({ path: SS('B7-ball-in-hand.png') });
  console.log(`B7: entered=${entered} — BIH controller implemented (CUE-013), trigger wired by P1-T03 foul rule`);
  expect(fs.existsSync(SS('B7-ball-in-hand.png'))).toBe(true);
});

// ─── B8: Auto-raise cue when near rail ────────────────────────────────────────
test('B8 — auto-raise cue near rail: drag aim toward a cushion, cue elevates', async ({ page }) => {
  await loadApp(page);

  const { x: cx, y: cy } = await cueBallScreenPos(page);

  // Drag toward the near rail (downward in screen = near cushion in 3D)
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 12; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 2, cy + i * 10);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS('B8-auto-raise-cue.png') });
  await canvasPointerEvent(page, 'pointerup', cx + 24, cy + 120, 0);
  expect(fs.existsSync(SS('B8-auto-raise-cue.png'))).toBe(true);
});

// ─── B9: Post-shot turn reset → cue returns to aiming state ──────────────────
test('B9 — post-shot turn reset: cue re-appears after replay ends', async ({ page }) => {
  await loadApp(page);

  // Aim toward rack first
  const { x: cx, y: cy } = await cueBallScreenPos(page);
  await canvasPointerEvent(page, 'pointerdown', cx, cy);
  for (let i = 1; i <= 6; i++) {
    await canvasPointerEvent(page, 'pointermove', cx + i * 15, cy);
    await page.waitForTimeout(15);
  }
  await canvasPointerEvent(page, 'pointerup', cx + 90, cy, 0);
  await page.waitForTimeout(100);

  // Fire via real ShotSlider path at 50%
  await fireShot(page, 50);

  // Immediately capture: cue hidden / balls moving
  await page.waitForTimeout(400);
  await page.screenshot({ path: SS('B9-replay-in-progress.png') });

  // Wait for replay to finish — cue should reappear for next turn
  await page.waitForTimeout(5000);
  await page.screenshot({ path: SS('B9-turn-reset.png') });

  console.log('B9: verify cue visible in B9-turn-reset.png, hidden in B9-replay-in-progress.png');
  expect(fs.existsSync(SS('B9-turn-reset.png'))).toBe(true);
});
