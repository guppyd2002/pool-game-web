/**
 * Pool Game Web — P1-T04 main entry point.
 *
 * GAME-002: Simplified startup — HTML HotSeat menu, no FB/PlayFab/IAP/WebSocket.
 * GAME-003: "Play HotSeat" button → session.startNewGame() → cue input enabled.
 * GAME-015 B-lite: camera tween overview↔table on game start/exit.
 * GAME-018: createBallPool8Session() wires physics + cue + replay → session.
 *
 * Ball-in-hand (GAME-014):
 *   BallInHandController handles physics.placeBall() + free-zone validation.
 *   After commit(), session.notifyBallPlaced() advances session state.
 */

import { createScene } from './renderer/scene';
import { createPoolTable } from './game/table-setup';
import { createBallPoolPhysics } from './game/ball-pool-physics';
import { createCueController } from './game/cue-controller';
import { createCueAdapter } from './game/cue-adapter';
import { createAimLine } from './renderer/aim-line';
import { createPowerBar } from './renderer/power-bar';
import { createCueMesh } from './renderer/cue-mesh';
import { createGhostBall } from './renderer/ghost-ball';
import { createPlacementMarker } from './renderer/placement-marker';
import { createBallInHandController } from './game/ball-in-hand';
import { tableIntersection, TABLE_PLANE_Y } from './game/cue-adapter';
import { CmVector } from './physics/cm-vector';
import { backswingOffset } from './game/shot-animation';
import { createShotSlider } from './game/shot-slider';
import { createSpinDisc } from './game/spin-disc';
import { createSpinDiscUI } from './renderer/spin-disc-ui';
import { createPowerSliderUI } from './renderer/power-slider-ui';
import { createUIEdgeFade } from './renderer/ui-edge-fade';
import { createBallPool8Session } from './game/game-session';
import { createReplayDriver } from './renderer/replay-driver';
import { createBallTrail } from './game/ball-trail';
import { createReasonBanner } from './renderer/reason-banner';
import { createGameOverUI } from './renderer/game-over-ui';
import { REASON_MESSAGES } from './game/game-play-reason';
import { createCameraTween, POSE_OVERVIEW, POSE_TABLE } from './renderer/camera-tween';
import { createTurnPrompt } from './renderer/turn-prompt';
import * as THREE from 'three';

// ─── Initialize scene + physics ───────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = createScene(container);
const space = createPoolTable();
const physics = createBallPoolPhysics(space, scene);

// ─── Cue control ─────────────────────────────────────────────────────────────

const cue = createCueController(physics);
const aimLine = createAimLine(scene.scene);
const powerBar = createPowerBar(container);
const cueMesh = createCueMesh(scene.scene);
const ghostBall = createGhostBall(scene.scene);

// CUE-013: ball-in-hand placement (GAME-014 BallMoveManager equiv)
const ballInHand = createBallInHandController(physics, 0);
const placementMarker = createPlacementMarker(scene.scene);
const _bihRaycaster = new THREE.Raycaster();
let _bihStartT = 0;

let _lastAimTime = 0;
let _punchSavedAimDir: CmVector | null = null;
let _punchSavedCueBallPos: CmVector | null = null;

const adapter = createCueAdapter({
  camera: scene.camera,
  // Dynamic camera lookup so ortho top-view raycasting works correctly
  getCameraFn: () => scene.activeCamera,
  element: scene.renderer.domElement,
  cueBallMesh: scene.balls[0],
  controller: cue,
  onAimUpdate: () => {
    // B4: dismiss turn prompt on first player interaction
    turnPrompt.dismiss();

    const now = performance.now() / 1000;
    const dt = _lastAimTime === 0 ? 0.016 : Math.min(now - _lastAimTime, 0.1);
    _lastAimTime = now;

    const cueBall = physics.getBall(0);
    const hit = cue.getAimHit();
    const power = cue.getPowerFraction();
    aimLine.update(cueBall.position, cue.aimLineVisible ? hit : null);
    ghostBall.update(cueBall.position, cue.aimLineVisible ? hit : null, power);
    powerBar.update(power);

    const aimDir = hit
      ? new CmVector(
          hit.point.x - cueBall.position.x,
          0,
          hit.point.z - cueBall.position.z,
        )
      : null;

    if (aimDir) {
      _punchSavedAimDir = aimDir;
      _punchSavedCueBallPos = cueBall.position;
    }

    cueMesh.update(cueBall.position, aimDir, dt, cue.getVerticalAngle(), power);
  },
  onShotFired: (power) => {
    if (!_punchSavedAimDir || !_punchSavedCueBallPos) return;
    const savedDir = _punchSavedAimDir;
    const savedPos = _punchSavedCueBallPos;

    let punchDone = false;
    let lastTs = 0;
    cueMesh.startPunchAnimation(backswingOffset(power), () => { punchDone = true; });

    function punchFrame(ts: number): void {
      if (punchDone) return;
      const dt = lastTs === 0 ? 0.016 : Math.min((ts - lastTs) / 1000, 0.1);
      lastTs = ts;
      cueMesh.update(savedPos, savedDir, dt, 0, 0);
      if (!punchDone) requestAnimationFrame(punchFrame);
    }
    requestAnimationFrame(punchFrame);
  },
  onZoom: (delta) => {
    const dir = scene.camera.position.clone().normalize();
    scene.camera.position.addScaledVector(dir, -delta * 0.5);
    scene.camera.position.clampLength(1.0, 5.0);
  },
});

// CUE-002: power slider
const shotSlider = createShotSlider({
  onStartControl: () => { adapter.disable(); },
  onEndControl:   () => { adapter.enable(); },
  onMove:  (f) => { powerBar.update(f); },
  onShot:  (f) => { cue.fireNow(f); },
});
const powerSliderUI = createPowerSliderUI(container, shotSlider);

// CUE-006/CUE-008: spin disc
const spinDisc = createSpinDisc({
  onOpen:  () => { adapter.disable(); },
  onClose: () => { adapter.enable(); },
  onSpinChange: (x, y) => cue.setSpinOffset(x, y),
});
const spinDiscUI = createSpinDiscUI(container, spinDisc);

// CUE-021: UI edge fade
const uiEdgeFade = createUIEdgeFade(scene.camera, [
  powerBar.element,
  powerSliderUI.element,
  spinDiscUI.element,
]);

// ─── B4: turn prompt + cue standby ────────────────────────────────────────────

const turnPrompt = createTurnPrompt(container);

// ─── GAME-015 B-lite: camera tween ────────────────────────────────────────────

const cameraTween = createCameraTween(scene.camera);

// Set camera to overview pose immediately (no tween, duration=0)
cameraTween.tweenTo(POSE_OVERVIEW, 0);

function _runCameraTween(fromNow = true): void {
  if (!fromNow) return;
  let lastTs = 0;
  const tick = (ts: number) => {
    const dt = lastTs === 0 ? 0 : (ts - lastTs) / 1000;
    lastTs = ts;
    cameraTween.update(dt);
    if (cameraTween.isActive) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ─── GAME-018: game session ────────────────────────────────────────────────────

const trail = createBallTrail();
const replayDriver = createReplayDriver();
const gameSession = createBallPool8Session({
  physics, cue, scene, replayDriver, trail,
});

// ─── GAME-002: main menu UI ────────────────────────────────────────────────────

const mainMenuEl = document.createElement('div');
mainMenuEl.id = 'main-menu';
mainMenuEl.style.cssText = [
  'position:absolute', 'inset:0',
  'display:flex', 'flex-direction:column',
  'align-items:center', 'justify-content:center',
  'background:rgba(10,10,26,0.85)',
  'color:#fff', 'font-family:sans-serif', 'z-index:300',
].join(';');
mainMenuEl.innerHTML = [
  '<h1 style="font-size:36px;margin-bottom:8px;letter-spacing:2px;">🎱 8-Ball Pool</h1>',
  '<p style="font-size:14px;opacity:0.6;margin-bottom:32px;">HotSeat — 2 players, same screen</p>',
  '<button id="btn-start" style="padding:14px 40px;font-size:18px;border-radius:6px;border:none;background:#4caf50;color:#fff;cursor:pointer;box-shadow:0 4px 12px rgba(76,175,80,0.4);">Play 8-Ball HotSeat</button>',
].join('');
container.appendChild(mainMenuEl);

const startBtn = mainMenuEl.querySelector('#btn-start') as HTMLButtonElement;

// ─── GAME-003: start → Aiming, cue enabled ───────────────────────────────────

startBtn.addEventListener('click', () => {
  mainMenuEl.style.display = 'none';
  topViewBtn.style.display = 'block';
  _inTopView = false;
  topViewBtn.textContent = '⬆ Top';
  cameraTween.tweenTo(POSE_TABLE, 0.5);
  _runCameraTween(true);
  gameSession.startNewGame();
});

// ─── Session overlays ─────────────────────────────────────────────────────────

const reasonBanner = createReasonBanner(container);

const gameOverUI = createGameOverUI(container);
gameOverUI.onPlayAgain = () => {
  gameOverUI.hide();
  gameSession.playAgain();
};
gameOverUI.onExit = () => {
  gameOverUI.hide();
  turnPrompt.dismiss();
  gameSession.exitGame();
  topViewBtn.style.display = 'none';
  _inTopView = false;
  topViewBtn.textContent = '⬆ Top';
  scene.setOrthoTop(false);  // ensure ortho is cleared on exit
  cameraTween.tweenTo(POSE_OVERVIEW, 0.5);
  _runCameraTween(true);
  mainMenuEl.style.display = 'flex';
};

// ─── B3: top-view toggle button + keyboard shortcut ──────────────────────────

const topViewBtn = document.createElement('button');
topViewBtn.textContent = '⬆ Top';
topViewBtn.style.cssText = [
  'position:absolute', 'top:12px', 'right:12px',
  'background:rgba(0,0,0,0.55)', 'color:#fff',
  'border:1px solid rgba(255,255,255,0.3)',
  'padding:6px 14px', 'border-radius:6px',
  'font-family:sans-serif', 'font-size:13px',
  'cursor:pointer', 'z-index:100',
  'display:none',
].join(';');
container.appendChild(topViewBtn);

let _inTopView = false;

topViewBtn.addEventListener('click', () => {
  // Cancel any in-progress aim drag so the aim-line overlay doesn't persist across camera switch.
  cue.cancel();
  _inTopView = !_inTopView;
  if (_inTopView) {
    // Switch to strict ortho top-down; ortho camera is self-contained, no tween needed.
    scene.setOrthoTop(true);
  } else {
    // Return to perspective; snap back to table pose (no tween — instant, avoids disorientation).
    scene.setOrthoTop(false);
    cameraTween.tweenTo(POSE_TABLE, 0);
  }
  topViewBtn.textContent = _inTopView ? '⬇ Table' : '⬆ Top';
});

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.key === 't' || e.key === 'T') && topViewBtn.style.display !== 'none') {
    topViewBtn.click();
  }
});

// ─── Player turn indicator ────────────────────────────────────────────────────

const playerIndicatorEl = document.createElement('div');
playerIndicatorEl.id = 'player-indicator';
playerIndicatorEl.style.cssText = [
  'position:absolute', 'top:12px', 'left:50%',
  'transform:translateX(-50%)',
  'background:rgba(0,0,0,0.55)', 'color:#fff',
  'padding:6px 20px', 'border-radius:20px',
  'font-family:sans-serif', 'font-size:14px',
  'pointer-events:none', 'display:none', 'z-index:100',
].join(';');
container.appendChild(playerIndicatorEl);

function _updatePlayerIndicator(playerIndex: 0 | 1, ballInHand: boolean): void {
  playerIndicatorEl.style.display = 'block';
  const playerLabel = `Player ${playerIndex + 1}`;
  playerIndicatorEl.textContent = ballInHand
    ? `${playerLabel} — Place cue ball`
    : `${playerLabel}'s turn`;
}

// ─── Session callbacks ─────────────────────────────────────────────────────────

gameSession.onTurnChanged = (playerIndex, ballInHand) => {
  _updatePlayerIndicator(playerIndex, ballInHand);
  // B4: show clear instruction overlay + cue standby preview
  turnPrompt.show(playerIndex, ballInHand);
  if (ballInHand) {
    _enterBallInHandMode();
  } else {
    // Show cue stick at default angle pointing toward the rack until player drags
    const cueBall = physics.getBall(0);
    cueMesh.update(cueBall.position, new CmVector(0.5, 0, 0), 0, 0, 0);
  }
};

gameSession.onGameEnded = (winner, reason) => {
  playerIndicatorEl.style.display = 'none';
  turnPrompt.dismiss();
  gameOverUI.show(winner, REASON_MESSAGES[reason] ?? '');
};

gameSession.onReasonMessage = (msg) => {
  if (msg) reasonBanner.show(msg);
};

// ─── Ball-in-hand pointer handling (GAME-014 BallMoveManager) ────────────────

function _bihNdcToTable(clientX: number, clientY: number): { x: number; z: number } | null {
  const rect = scene.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  // Use activeCamera so ball-in-hand placement works in ortho top-view too
  _bihRaycaster.setFromCamera(ndc, scene.activeCamera);
  return tableIntersection(_bihRaycaster, TABLE_PLANE_Y);
}

function _enterBallInHandMode(): void {
  adapter.disable();
  _bihStartT = performance.now() / 1000;
  ballInHand.enter();
  const t = performance.now() / 1000 - _bihStartT;
  placementMarker.update(ballInHand.proposedPosition, ballInHand.proposedIsFree, t);
}

function onBihPointerMove(e: PointerEvent): void {
  if (!gameSession.isBallInHand || !ballInHand.isActive) return;
  const pt = _bihNdcToTable(e.clientX, e.clientY);
  if (pt) ballInHand.move(pt.x, pt.z);
  const t = performance.now() / 1000 - _bihStartT;
  placementMarker.update(ballInHand.proposedPosition, ballInHand.proposedIsFree, t);
}

function onBihPointerUp(_e: PointerEvent): void {
  if (!gameSession.isBallInHand || !ballInHand.isActive) return;
  if (ballInHand.commit()) {
    placementMarker.update(null, false, 0);
    gameSession.notifyBallPlaced();  // session state (store, trail, cue) — physics already done
    adapter.enable();
  }
}

const _canvas = scene.renderer.domElement;
_canvas.addEventListener('pointermove', onBihPointerMove as EventListener);
_canvas.addEventListener('pointerup', onBihPointerUp as EventListener);

// ─── Start physics loop ────────────────────────────────────────────────────────

physics.start();

// ─── Cleanup ──────────────────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  _canvas.removeEventListener('pointermove', onBihPointerMove as EventListener);
  _canvas.removeEventListener('pointerup', onBihPointerUp as EventListener);
  adapter.dispose();
  aimLine.dispose();
  ghostBall.dispose();
  powerSliderUI.dispose();
  spinDiscUI.dispose();
  uiEdgeFade.dispose();
  powerBar.dispose();
  cueMesh.dispose();
  placementMarker.dispose();
  reasonBanner.dispose();
  gameOverUI.dispose();
  replayDriver.dispose();
  turnPrompt.dispose();
});

// ─── Playwright / test hook ──────────────────────────────────────────────────
// Exposes minimal refs for headless browser smoke tests.
(window as unknown as Record<string, unknown>).__poolDebug = {
  camera: scene.camera,
  cueBallMesh: scene.balls[0],
  balls: scene.balls,
  renderer: scene.renderer,
  scene: scene.scene,
  gameSession,
};

