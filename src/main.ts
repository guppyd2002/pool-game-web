/**
 * Pool Game Web — Landscape UX entry point.
 *
 * GAME-002: Simplified startup — HTML HotSeat menu, no FB/PlayFab/IAP/WebSocket.
 * GAME-003: "Play HotSeat" button → session.startNewGame() → cue input enabled.
 * GAME-015 B-lite: camera tween overview↔table on game start/exit.
 * GAME-018: createBallPool8Session() wires physics + cue + replay → session.
 *
 * Landscape layout (landscape-ux):
 *   HUD  = top 36dp strip (P1 | turn info | P2 | controls).
 *   Aim  = tap/drag on canvas (C-1 tap=absolute, drag=relative).
 *   Power = right-side vertical bar 48×240dp (down=charge, release=fire).
 *   Fine  = bottom-centre horizontal bar 680dp (left/right ±5°).
 *   Spin  = left-side collapsible disc (auto-close 2s).
 */

import { createScene } from './renderer/scene';
import { createPoolTable } from './game/table-setup';
import { createBallPoolPhysics } from './game/ball-pool-physics';
import { createCueController } from './game/cue-controller';
import { createCueAdapter } from './game/cue-adapter';
import { createAimLine } from './renderer/aim-line';
import { createPowerBar } from './renderer/power-bar';
import { createCueMesh } from './renderer/cue-mesh';
import {
  createGhostBall,
  getAimLineDistanceM,
  setAimLineDistanceM,
} from './renderer/ghost-ball';
import { getCueAimGuideLengthM, setCueAimGuideLengthM } from './renderer/aim-line';
import { createAimLengthDebugUI } from './renderer/aim-length-debug-ui';
import { createPlacementMarker } from './renderer/placement-marker';
import { createBallInHandController } from './game/ball-in-hand';
import { tableIntersection, TABLE_PLANE_Y } from './game/cue-adapter';
import { MULTIPLIER } from './physics/fixed-math';
import { CmVector } from './physics/cm-vector';
import { backswingOffset } from './game/shot-animation';
import { createShotSlider } from './game/shot-slider';
import { createSpinDisc } from './game/spin-disc';
import { createSpinDiscUI } from './renderer/spin-disc-ui';
import { createPowerSliderUI } from './renderer/power-slider-ui';
import { createFineAdjustBarUI } from './renderer/fine-adjust-bar-ui';
import { createUIEdgeFade } from './renderer/ui-edge-fade';
import { createBallPool8Session } from './game/game-session';
import { attachAIDemo, parseDemoConfig } from './game/ai-demo';
import { pickValidSeed } from './game/headless-game';
import { createRecordDriver, downloadRecord, parseRecord } from './game/record-driver';
import { createReplayHUD } from './renderer/replay-hud';
import { createReplayDriver } from './renderer/replay-driver';
import { createBallTrail } from './game/ball-trail';
import { createReasonBanner } from './renderer/reason-banner';
import { createGameOverUI } from './renderer/game-over-ui';
import { REASON_MESSAGES } from './game/game-play-reason';
import { createCameraTween, POSE_OVERVIEW, getPlayView } from './renderer/camera-tween';
import { createTurnPrompt } from './renderer/turn-prompt';
import { createHudBar } from './renderer/hud-bar';
import { createPlayerBallHud } from './renderer/player-ball-hud';
import { createTutorialOverlay } from './renderer/tutorial-overlay';
import * as THREE from 'three';

// ─── Initialize scene + physics ───────────────────────────────────────────────

const container = document.getElementById('app')!;
const scene = await createScene(container);
const space = createPoolTable();
const physics = createBallPoolPhysics(space, scene);

// ─── Cue control ─────────────────────────────────────────────────────────────

const cue = createCueController(physics);
const aimLine = createAimLine(scene.scene);
const powerBar = createPowerBar(container);
const cueMesh = createCueMesh(scene.scene);
const ghostBall = createGhostBall(scene.scene);

// SP-Harden-9d TEMP: dual sliders — A target extension (_lineDistanceM) + B cue blue guide.
// Default ON for mobile prod; hide with ?debug=aimlen=0 or ?debug=off. Remove after CEO locks.
const _showAimLenDebug = new URLSearchParams(window.location.search).get('debug') !== 'aimlen=0'
  && new URLSearchParams(window.location.search).get('debug') !== 'off';
const aimLengthDebug = _showAimLenDebug
  ? createAimLengthDebugUI(container, () => { _updateAimVisuals(); })
  : null;

// CUE-013: ball-in-hand placement (GAME-014 BallMoveManager equiv)
const ballInHand = createBallInHandController(physics, 0);
const placementMarker = createPlacementMarker(scene.scene);
const _bihRaycaster = new THREE.Raycaster();
let _bihStartT = 0;

// ─── Aim/shot visual state ────────────────────────────────────────────────────

let _lastAimTime = 0;
// Current power fraction from the power bar (0..1); used by aim line preview.
let _currentPowerFraction = 0;
let _punchSavedAimDir: CmVector | null = null;
let _punchSavedCueBallPos: CmVector | null = null;
/** Injected after gameSession is built — Unity IsAllowableTargetBall for red/white assist. */
let _isAllowableBall: (id: number) => boolean = () => true;

/**
 * Refresh all aim-line visuals using the current power fraction and CUE-002
 * saved aim state.  Called both from the aim-drag adapter (onAimUpdate) and
 * from the power bar (onMove) so the preview stays honest in both directions.
 */
function _updateAimVisuals(): void {
  const now = performance.now() / 1000;
  const dt = _lastAimTime === 0 ? 0.016 : Math.min(now - _lastAimTime, 0.1);
  _lastAimTime = now;

  const cueBall = physics.getBall(0);
  // F-A: use nominal 0.5 force when power bar idle so aim line always shows
  // during aim drag. When power bar held, use real fraction (M-2 bit-exact).
  const _previewForce = _currentPowerFraction > 0 ? _currentPowerFraction : 0.5;
  // F-B / SP-Harden-5: suppress assist while simulating (Unity InShot gate).
  const hit = physics.isSimulating ? null : cue.getAimHit(_previewForce);
  const power = _currentPowerFraction;
  const show = cue.aimLineVisible ? hit : null;
  // Legal white / illegal red — Unity SetIsAllowableTargetBall on first-hit ball.
  let isLegal = true;
  if (show && show.hitType === 'ball' && show.ballId != null) {
    isLegal = _isAllowableBall(show.ballId);
  }
  aimLine.update(cueBall.position, show, isLegal);
  ghostBall.update(cueBall.position, show, power, isLegal);
  powerBar.update(power);  // small overlay power indicator

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
}

// ─── CUE-adapter ─────────────────────────────────────────────────────────────

const adapter = createCueAdapter({
  camera: scene.camera,
  // Dynamic camera lookup so ortho top-view raycasting works correctly
  getCameraFn: () => scene.activeCamera,
  element: scene.renderer.domElement,
  cueBallMesh: scene.balls[0],
  controller: cue,
  onAimUpdate: () => {
    turnPrompt.dismiss();
    tutorial.onAimSet();
    _updateAimVisuals();
  },
  onZoom: (delta) => {
    const dir = scene.camera.position.clone().normalize();
    scene.camera.position.addScaledVector(dir, -delta * 0.5);
    scene.camera.position.clampLength(1.0, 5.0);
  },
  // F-③ tap-to-aim: provide cueball world position (float meters) for C-1 aim pair.
  getCueBallWorld: () => {
    const b = physics.getBall(0);
    return { x: b.position.x / MULTIPLIER, z: b.position.z / MULTIPLIER };
  },
  // onShotFired removed: 8BP fires via power bar (see shotSlider.onShot below)
});

// ─── CUE-002: Power bar (8BP main shot path) ──────────────────────────────────
//
// 8BP分離模式:
//   ShotSlider domain: isAutoShot=true → endControl() fires automatically.
//   PowerSliderUI: vertical bar right side; drag ↑ to charge, release to fire.
//   onStartControl: disable aim adapter (prevent aim/fire overlap).
//   onEndControl:   re-enable aim adapter after shot/cancel.
//   onShot: fireNow(forceFraction) — uses saved CUE-002 aim state.
//           M-1: fireNow now checks _isEnabled, so AI/opponent turns are safe.

const shotSlider = createShotSlider({
  isAutoShot: true,
  // UX: new players see 50% power at turn start so the first shot isn't a no-op.
  // Physics-faithful: force is clamped 0-1 at fire time; C# parity unaffected.
  defaultForce: 0.5,
  // C-2 mutex (b): power charging locks both aim drag AND fine-adjust bar.
  // Extends existing onStartControl→adapter.disable pattern to cover fine-adjust.
  onStartControl: () => {
    adapter.disable();
    fineAdjustBar.disable();
    tutorial.onPowerStart();
  },
  onEndControl:   () => { adapter.enable(); fineAdjustBar.enable(); },
  onMove:  (f) => {
    _currentPowerFraction = f;
    _updateAimVisuals();
  },
  onShot:  (f) => {
    _currentPowerFraction = f;
    const fired = cue.fireNow(f);
    if (fired) tutorial.onShot();
    if (fired && _punchSavedAimDir && _punchSavedCueBallPos) {
      // Trigger punch animation using last saved aim direction
      const savedDir = _punchSavedAimDir;
      const savedPos = _punchSavedCueBallPos;
      let punchDone = false;
      let lastTs = 0;
      cueMesh.startPunchAnimation(backswingOffset(f), () => { punchDone = true; });
      function punchFrame(ts: number): void {
        if (punchDone) return;
        const dt = lastTs === 0 ? 0.016 : Math.min((ts - lastTs) / 1000, 0.1);
        lastTs = ts;
        cueMesh.update(savedPos, savedDir, dt, 0, 0);
        if (!punchDone) requestAnimationFrame(punchFrame);
      }
      requestAnimationFrame(punchFrame);
    }
    // Reset power fraction and visuals after shot attempt
    _currentPowerFraction = 0;
    _updateAimVisuals();
  },
  onCancel: () => {
    _currentPowerFraction = 0;
    _updateAimVisuals();
  },
});

const powerSliderUI = createPowerSliderUI(container, shotSlider);
// Power bar starts hidden; shown when game starts (not in demo/replay spectator view)
powerSliderUI.element.style.display = 'none';

// Fine-adjust bar — bottom-centre horizontal, ±5° precision aim rotation.
const fineAdjustBar = createFineAdjustBarUI(container, cue, () => {
  turnPrompt.dismiss();
  _updateAimVisuals();
});
fineAdjustBar.element.style.display = 'none';

// CUE-006/CUE-008: spin disc
const spinDisc = createSpinDisc({
  onOpen:  () => { adapter.disable(); },
  onClose: () => { adapter.enable(); },
  onSpinChange: (x, y) => cue.setSpinOffset(x, y),
});
const spinDiscUI = createSpinDiscUI(container, spinDisc);

// CUE-021: UI edge fade — passive indicators only; powerSliderUI excluded
// because it is the primary interactive control and must remain at full opacity.
const uiEdgeFade = createUIEdgeFade(scene.camera, [
  powerBar.element,
  spinDiscUI.element,
]);

// ─── B4: turn prompt + cue standby ────────────────────────────────────────────

const turnPrompt = createTurnPrompt(container);
const tutorial = createTutorialOverlay(container);

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
// SP-Harden-5: wire group-aware allowable for ghost/aim legal colour.
_isAllowableBall = (id) => gameSession.getAllowableFn()(id);

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
  '<label id="btn-load-replay" style="margin-top:16px;padding:10px 32px;font-size:15px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;">📂 Load Replay</label>',
  '<input id="inp-record" type="file" accept=".poolrecord,.json" style="display:none;">',
].join('');
container.appendChild(mainMenuEl);

const startBtn = mainMenuEl.querySelector('#btn-start') as HTMLButtonElement;
const loadReplayLabel = mainMenuEl.querySelector('#btn-load-replay') as HTMLLabelElement;
const loadReplayInput = mainMenuEl.querySelector('#inp-record') as HTMLInputElement;
loadReplayLabel.htmlFor = 'inp-record';

loadReplayInput.addEventListener('change', () => {
  const file = loadReplayInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const shots = parseRecord(reader.result as string);
    if (!shots || shots.length === 0) { alert('Invalid or empty .poolrecord file.'); return; }
    mainMenuEl.style.display = 'none';
    hudBar.setVisible(true);
    playerBallHud.setVisible(true);
    hudBar.setTopViewLabel('⬇ Table');
    _inTopView = true;
    scene.setOrthoTop(true);
    // Disable all human controls — replay drives the session
    adapter.disable();
    powerSliderUI.element.style.display = 'none';  // M-1: no power bar during replay
    fineAdjustBar.element.style.display = 'none';
    spinDiscUI.element.style.display = 'none';
    // SP-Harden-8: keep 7-slot HUD in sync during replay (no aim-driven refresh).
    replayHUD.start(gameSession, physics, scene, shots, _refreshBallHud);
  };
  reader.readAsText(file);
  // Reset so the same file can be re-loaded
  loadReplayInput.value = '';
});

// ─── GAME-003: start → Aiming, cue enabled ───────────────────────────────────

startBtn.addEventListener('click', () => {
  mainMenuEl.style.display = 'none';
  hudBar.setVisible(true);
  playerBallHud.setVisible(true);
  hudBar.setTopViewLabel('⬇ Table');
  powerSliderUI.element.style.display = 'block';
  fineAdjustBar.element.style.display = 'block';
  spinDiscUI.element.style.display = 'block';
  _inTopView = true;
  scene.setOrthoTop(true);
  tutorial.start();
  gameSession.startNewGame();
  _refreshBallHud();
});

// ─── Session overlays ─────────────────────────────────────────────────────────

const reasonBanner = createReasonBanner(container);

const gameOverUI = createGameOverUI(container);
const replayHUD = createReplayHUD(container);
gameOverUI.onPlayAgain = () => {
  gameOverUI.hide();
  gameSession.playAgain();
};
gameOverUI.onExit = () => {
  gameOverUI.hide();
  turnPrompt.dismiss();
  gameSession.exitGame();
  hudBar.setVisible(false);
  playerBallHud.setVisible(false);
  powerSliderUI.element.style.display = 'none';
  fineAdjustBar.element.style.display = 'none';
  spinDiscUI.element.style.display = 'none';
  adapter.setFineAim(false);
  hudBar.setFineAimActive(false);
  _inTopView = false;
  hudBar.setTopViewLabel('⬆ Top');
  scene.setOrthoTop(false);
  cameraTween.tweenTo(POSE_OVERVIEW, 0.5);
  _runCameraTween(true);
  mainMenuEl.style.display = 'flex';
};

// ─── HUD bar (top strip) — landscape layout ──────────────────────────────────

let _inTopView = false;
let _isLeftHand = false;

function _toggleView(): void {
  cue.cancel();
  _inTopView = !_inTopView;
  if (_inTopView) {
    scene.setOrthoTop(true);
  } else {
    scene.setOrthoTop(false);
    // SP-Harden-3b: restore viewport-aware play pose (not fixed desktop pose).
    const vw = container.clientWidth || window.innerWidth;
    const vh = container.clientHeight || window.innerHeight;
    const { pose, fov } = getPlayView(vw, vh);
    scene.camera.fov = fov;
    scene.camera.updateProjectionMatrix();
    cameraTween.tweenTo(pose, 0);
  }
  hudBar.setTopViewLabel(_inTopView ? '⬇ Table' : '⬆ Top');
}

function _toggleFineAim(): void {
  adapter.setFineAim(!adapter.isFineAim);
  hudBar.setFineAimActive(adapter.isFineAim);
}

const hudBar = createHudBar(container, {
  onToggleView: _toggleView,
  onToggleLeftHand: () => {
    _isLeftHand = !_isLeftHand;
    container.classList.toggle('left-hand-mode', _isLeftHand);
    hudBar.setLeftHandActive(_isLeftHand);
  },
  onToggleFineAim: _toggleFineAim,
});
hudBar.setVisible(false);  // hidden until game starts

// SP-Harden-6: 7-slot solids/stripes progress under HUD (Unity BallPool8PlayerUI)
const playerBallHud = createPlayerBallHud(container);
playerBallHud.setVisible(false);

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.key === 't' || e.key === 'T') && !mainMenuEl.style.display.includes('flex')) {
    _toggleView();
  }
  if (e.key === 'Shift') hudBar.setFineAimActive(adapter.isFineAim);
});
window.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.key === 'Shift') hudBar.setFineAimActive(adapter.isFineAim);
});

// ─── Player turn indicator (via HUD bar) ─────────────────────────────────────

function _refreshBallHud(): void {
  const slots = gameSession.getPlayerBallSlots();
  playerBallHud.update(slots.p0, slots.p1, slots.t0, slots.t1);
}

function _updatePlayerIndicator(playerIndex: 0 | 1, isBallInHand: boolean): void {
  hudBar.setPlayerTurn(playerIndex, isBallInHand);
  // After every turn change (incl. post-shot) refresh 7-slot pocket progress.
  _refreshBallHud();
  // SP-Harden-3: re-show "Tap to aim" only when turn is ready (not mid-flight).
  if (!isBallInHand) tutorial.onTurnReady();
}

// ─── Session callbacks ─────────────────────────────────────────────────────────

// onGameEnded and onReasonMessage are shared by both HotSeat and demo modes
gameSession.onGameEnded = (winner, reason) => {
  turnPrompt.dismiss();
  gameOverUI.show(winner, REASON_MESSAGES[reason] ?? '');
};

gameSession.onReasonMessage = (msg) => {
  if (msg) reasonBanner.show(msg);
};

// ─── Demo mode: ?demo=ai-selfplay [&seed=N] [&r0=N] [&r1=N] [&delay=N] ───────

const _demoConfig = parseDemoConfig(new URLSearchParams(window.location.search));

if (_demoConfig) {
  // If no explicit ?seed= in URL, headless-simulate to find a valid random seed
  // (avoids ~37% deadlock/cap-hit seeds; pickValidSeed tries up to 15 candidates, <2s).
  if (!_demoConfig.seedFromUrl) {
    _demoConfig.seed = pickValidSeed(_demoConfig.rank0, _demoConfig.rank1, Math.floor(Math.random() * 10000));
  }

  // AI self-play: attach AI turn loop (sets onTurnChanged internally)
  attachAIDemo(gameSession, physics, space, _demoConfig);
  // Wrap to also update player indicator (shows which AI is playing)
  const _demoTurnFn = gameSession.onTurnChanged;
  gameSession.onTurnChanged = (playerIndex, isBallInHand) => {
    _updatePlayerIndicator(playerIndex, isBallInHand);
    _demoTurnFn?.(playerIndex, isBallInHand);
  };

  // Recording: wire onShotFired to accumulate per-shot records for download
  const _recConfig = {
    engineVersion: 'dev',
    players: [
      { type: 'AI' as const, rank: _demoConfig.rank0 },
      { type: 'AI' as const, rank: _demoConfig.rank1 },
    ] as [{ type: 'AI'; rank: number }, { type: 'AI'; rank: number }],
    gameSeed: _demoConfig.seed,
  };
  const { driver: _recDriver, record: _recRecord } = createRecordDriver(_recConfig);
  // SP-Harden-8: refresh group HUD after every settled shot (AI demo has no aim events).
  gameSession.onShotFired = (s) => {
    _refreshBallHud();
    _recDriver.onShotFired(s);
  };

  // Override onGameEnded to finalize recording and expose download button
  const _prevDemoGameEnded = gameSession.onGameEnded;
  gameSession.onGameEnded = (winner, reason) => {
    _recDriver.finalize({ winner, reason, totalShots: _recRecord.shots.length });
    gameOverUI.onDownloadRecord = () => downloadRecord(_recRecord, _recConfig);
    _prevDemoGameEnded?.(winner, reason);
  };

  // Auto-start: skip main menu, enter ortho top-view, begin game
  mainMenuEl.style.display = 'none';
  hudBar.setVisible(true);
  playerBallHud.setVisible(true);
  hudBar.setTopViewLabel('⬇ Table');
  // M-1 defense-in-depth: disable adapter (not just hide bars) so tap/drag cannot
  // pollute _lastAim* during AI demo. Primary gates: hidden bars + _isEnabled in fireNow.
  adapter.disable();
  // M-1: power bar + controls hidden for AI spectator — no human can fire.
  // fireNow also checks _isEnabled (double gate), but hiding is the primary protection.
  powerSliderUI.element.style.display = 'none';
  fineAdjustBar.element.style.display = 'none';
  spinDiscUI.element.style.display = 'none';
  _inTopView = true;
  scene.setOrthoTop(true);
  gameSession.startNewGame();
  _refreshBallHud(); // open-table empty rows at demo start
} else {
  // Normal HotSeat mode: human-controlled turn changes
  gameSession.onTurnChanged = (playerIndex, isBallInHand) => {
    _updatePlayerIndicator(playerIndex, isBallInHand);
    // Reset power bar at each turn start
    powerSliderUI.reset();
    _currentPowerFraction = 0;
    // B4: show clear instruction overlay + cue standby preview
    turnPrompt.show(playerIndex, isBallInHand);
    if (isBallInHand) {
      _enterBallInHandMode();
    } else {
      // G-2: set default aim so _updateAimVisuals shows cue + line before first drag.
      // direction = start − current = (0.2, 0) → normalized +X (toward rack).
      // resetForNewTurn() already cleared stale aim; this sets a fresh default each turn.
      cue.onDragStart({ x: 0.1, z: 0 });
      cue.onDragMove({ x: -0.1, z: 0 });
      cue.cancel();
      _updateAimVisuals();
    }
  };
}

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
  // M-3: disable power bar during BIH — dragging power bar would fire with an
  // uncommitted cue ball position, injecting a shot before placement.
  powerSliderUI.element.style.display = 'none';
  // BIH: disable fine-adjust bar too (§5: BIH 期間左右兩 bar 都 disable)
  fineAdjustBar.element.style.display = 'none';
  fineAdjustBar.disable();
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
    // M-3: re-enable power bar after ball is placed
    powerSliderUI.element.style.display = 'block';
    // Re-enable fine-adjust bar after ball is placed
    fineAdjustBar.element.style.display = 'block';
    fineAdjustBar.enable();
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
  aimLengthDebug?.dispose();
  powerSliderUI.dispose();
  fineAdjustBar.dispose();
  spinDiscUI.dispose();
  uiEdgeFade.dispose();
  powerBar.dispose();
  cueMesh.dispose();
  placementMarker.dispose();
  reasonBanner.dispose();
  gameOverUI.dispose();
  replayHUD.dispose();
  replayDriver.dispose();
  turnPrompt.dispose();
  hudBar.dispose();
  playerBallHud.dispose();
  tutorial.dispose();
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
  cue,  // exposes getAimState() for overlay hitTest guard smoke test
  toggleColliders: () => scene.toggleColliders?.(),  // show/hide physics boundary overlay
  // SP-Harden-9d TEMP — dual: A=target extension (_lineDistanceM), B=cue blue guide
  getCueAimGuideLengthM,
  setCueAimGuideLengthM,
  getAimLineDistanceM,
  setAimLineDistanceM,
};
