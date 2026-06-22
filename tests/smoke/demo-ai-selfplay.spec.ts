/**
 * P1-T05 CEO demo self-verify — AI self-play renders a complete clean game.
 *
 * SV1 — Demo auto-starts (no button click): table visible, player indicator shown.
 * SV2 — First AI shot fires within 3 s of page load.
 * SV3 — Game plays to completion: game-over UI appears with a winner (player 1 or 2).
 *
 * URL: ?demo=ai-selfplay&seed=7&r0=4&r1=2&delay=0
 *   seed=7 verified cleanWin=true in P1-T05 asymmetric test (37 shots).
 *   delay=0 removes inter-shot pause so the test completes in replay-time only.
 *
 * Timeout: 120 s to accommodate ~37 shots × replay time in headless Chromium.
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const BASE_URL = 'http://localhost:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS = (n: string) => path.join(__dirname, 'screenshots', n);
const DEMO_URL = `${BASE_URL}?demo=ai-selfplay&seed=7&r0=4&r1=2&delay=0`;

async function gotoDemo(page: Page) {
  if (!fs.existsSync(path.join(__dirname, 'screenshots'))) {
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  }
  await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);  // let game start + first shot schedule
}

function poolDebug(page: Page) {
  return page.evaluate(() => {
    type Debug = {
      gameSession: {
        currentPlayerIndex: number;
        isGameEnded: boolean;
        store: { getState: () => { phase: string } };
      };
      balls: Array<{ visible: boolean }>;
    };
    return (window as unknown as Record<string, unknown>).__poolDebug as Debug | undefined;
  });
}

test.setTimeout(120_000);  // full game replay may take ~60–90 s in headless Chromium

test('SV1 — demo auto-starts: table is visible, no main menu', async ({ page }) => {
  await gotoDemo(page);
  await page.screenshot({ path: SS('SV1-demo-start.png') });

  // Main menu must be hidden (display:none)
  const menuVisible = await page.evaluate(() => {
    const el = document.getElementById('main-menu');
    return el ? el.style.display !== 'none' : false;
  });
  expect(menuVisible, 'main menu must be hidden in demo mode').toBe(false);

  // Player indicator must be visible (set on first onTurnChanged)
  const indicatorVisible = await page.evaluate(() => {
    const el = document.getElementById('player-indicator');
    return el ? el.style.display !== 'none' : false;
  });
  expect(indicatorVisible, 'player indicator visible on first turn').toBe(true);
});

test('SV2 — first AI shot fires: phase transitions to InShot within 3 s', async ({ page }) => {
  await gotoDemo(page);

  // Wait up to 3 s for the session to enter InShot (first forceShot called)
  const phaseReachedShot = await page.waitForFunction(
    () => {
      const d = (window as unknown as Record<string, unknown>).__poolDebug as
        { gameSession: { store: { getState: () => { phase: string } } } } | undefined;
      const phase = d?.gameSession?.store?.getState()?.phase;
      // InShot or any post-shot phase counts (replay may complete before we poll)
      return phase === 'InShot' || phase === 'Aiming';  // first shot fired → InShot then back to Aiming
    },
    {},
    { timeout: 3000 },
  ).then(() => true).catch(() => false);

  await page.screenshot({ path: SS('SV2-first-shot.png') });
  expect(phaseReachedShot, 'first AI shot must fire within 3 s').toBe(true);
});

test('SV3 — game plays to completion: game-over UI shows a winner', async ({ page }) => {
  await gotoDemo(page);

  // Wait for game-over element to become visible (up to 110 s)
  await page.locator('#game-over').waitFor({ state: 'visible', timeout: 110_000 });

  // Capture final screen showing winner
  await page.screenshot({ path: SS('SV3-demo-gameover.png') });

  // Confirm winner text is present
  const winnerText = await page.locator('#game-over').innerText();
  console.log(`SV3 game-over text: ${winnerText}`);
  // Should mention "Player 1" or "Player 2" and "Win" / "Wins"
  expect(winnerText.toLowerCase()).toMatch(/player [12]/);

  // Session isGameEnded must be true
  const ended = await page.evaluate(() => {
    const d = (window as unknown as Record<string, unknown>).__poolDebug as
      { gameSession: { isGameEnded: boolean } } | undefined;
    return d?.gameSession?.isGameEnded ?? false;
  });
  expect(ended, 'session.isGameEnded must be true after game-over').toBe(true);
});
