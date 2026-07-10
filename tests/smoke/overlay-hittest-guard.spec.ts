/**
 * Overlay hitTest guard smoke test — Playwright/Chromium.
 *
 * Verifies that tapping/dragging on the three landscape overlays
 * (power bar, spin disc, fine-adjust bar) does NOT trigger the canvas
 * aim-drag adapter and does NOT alter the CueController aim state.
 *
 * Risk: power/spin/fine-adjust overlays are positioned ON the table
 * (z-index:100 sibling of canvas). If the canvas aim listener were ever
 * moved from canvas→container, events on overlays could silently set aim.
 * This test locks the invariant: overlay interactions ≠ aim changes.
 *
 * Method:
 *   1. Start HotSeat game (aim state starts null).
 *   2. Record aim state = null baseline.
 *   3. Tap power bar overlay center → aim state must stay null.
 *   4. Tap spin disc button center → aim state must stay null.
 *   5. Drag fine-adjust bar center → aim state must stay null (no prior aim = noop).
 *   6. Set aim via canvas tap → record non-null aim state (start + current).
 *   7. Tap power bar → aim state must be byte-identical (start+current unchanged).
 *   8. Tap spin disc button → aim state must be byte-identical.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

type AimState = { start: { x: number; z: number } | null; current: { x: number; z: number } | null };

interface PoolDebug {
  cue: { getAimState(): AimState };
  renderer: { domElement: HTMLCanvasElement };
  gameSession: { isBallInHand: boolean };
}

async function goto(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
}

async function clickPlay(page: Page): Promise<void> {
  const btn = page.locator('button').filter({ hasText: /play|hotseat/i }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(800); }
}

/** Read current aim state from __poolDebug.cue.getAimState(). */
async function readAimState(page: Page): Promise<AimState> {
  return page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as PoolDebug | undefined;
    if (!d?.cue) return { start: null, current: null };
    const s = d.cue.getAimState();
    return {
      start: s.start ? { x: s.start.x, z: s.start.z } : null,
      current: s.current ? { x: s.current.x, z: s.current.z } : null,
    };
  });
}

/** Dispatch a pointer tap sequence on a DOM element located by CSS selector. */
async function tapOverlay(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await el.dispatchEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 });
  await el.dispatchEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 });
}

/** Dispatch a horizontal drag on fine-adjust bar track. */
async function dragFineBar(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Fine-adjust bar track: find div with cursor:ew-resize
    const track = Array.from(document.querySelectorAll('div')).find(
      el => getComputedStyle(el).cursor === 'ew-resize'
    );
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true }));
    track.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy, pointerId: 1, isPrimary: true }));
    track.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy, pointerId: 1, isPrimary: true }));
  });
}

/** Tap canvas at (clientX, clientY) to set aim via C-1 absolute tap. */
async function tapCanvas(page: Page, clientX: number, clientY: number): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }));
  }, { x: clientX, y: clientY });
  await page.waitForTimeout(100);
}

test.describe('Overlay hitTest guard — aim state invariant', () => {

  test('power bar tap does not set aim when aim is null', async ({ page }) => {
    await goto(page);
    await clickPlay(page);

    const before = await readAimState(page);
    expect(before.start).toBeNull();

    // Tap the power bar track (ns-resize cursor div)
    await page.evaluate(() => {
      const track = Array.from(document.querySelectorAll('div')).find(
        el => getComputedStyle(el).cursor === 'ns-resize'
      );
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true }));
      track.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 1, isPrimary: true }));
    });

    const after = await readAimState(page);
    expect(after.start).toBeNull();
  });

  test('spin disc button tap does not set aim when aim is null', async ({ page }) => {
    await goto(page);
    await clickPlay(page);

    const before = await readAimState(page);
    expect(before.start).toBeNull();

    // Tap the spin disc button (round button, border-radius:50%)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        el => el.style.borderRadius === '50%'
      );
      if (!btn) return;
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
      btn.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    });

    const after = await readAimState(page);
    expect(after.start).toBeNull();
  });

  test('fine-adjust bar drag does not set aim when aim is null', async ({ page }) => {
    await goto(page);
    await clickPlay(page);

    const before = await readAimState(page);
    expect(before.start).toBeNull();

    await dragFineBar(page);

    const after = await readAimState(page);
    // Fine-adjust with no aim is a noop — start must remain null
    expect(after.start).toBeNull();
  });

  test('power bar tap does not alter existing aim (start+current unchanged)', async ({ page }) => {
    await goto(page);
    await clickPlay(page);

    // Set aim via canvas tap at centre
    const canvasBox = await page.locator('canvas').boundingBox();
    if (!canvasBox) throw new Error('canvas not found');
    await tapCanvas(page, canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);

    const before = await readAimState(page);
    // aim may still be null if game is in BIH state — skip assertion in that case
    if (!before.start) { test.skip(); return; }

    // Tap power bar
    await page.evaluate(() => {
      const track = Array.from(document.querySelectorAll('div')).find(
        el => getComputedStyle(el).cursor === 'ns-resize'
      );
      if (!track) return;
      const rect = track.getBoundingClientRect();
      track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + 10, pointerId: 1, isPrimary: true }));
      track.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + 10, pointerId: 1, isPrimary: true }));
    });

    const after = await readAimState(page);
    expect(after.start).toEqual(before.start);
    expect(after.current).toEqual(before.current);
  });

  test('spin disc button tap does not alter existing aim', async ({ page }) => {
    await goto(page);
    await clickPlay(page);

    const canvasBox = await page.locator('canvas').boundingBox();
    if (!canvasBox) throw new Error('canvas not found');
    await tapCanvas(page, canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);

    const before = await readAimState(page);
    if (!before.start) { test.skip(); return; }

    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        el => el.style.borderRadius === '50%'
      );
      btn?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
      btn?.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    });

    const after = await readAimState(page);
    expect(after.start).toEqual(before.start);
    expect(after.current).toEqual(before.current);
  });
});
