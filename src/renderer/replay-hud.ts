/**
 * Replay HUD — Mode A playback controls.
 * play / pause / step-fwd / step-bk / reset / speed / shot-seek
 *
 * Seek replays startNewGame + shots[0..n-1] headlessly to correctly rewind
 * both physics and rule-engine state.  Ball-in-hand transitions use
 * session.isBallInHand (live state) — not cueBallPlaced, which is null when
 * BIH occurs but the AI keeps the cue ball in place.
 */

import type { IGameSession, RecordedShot } from '../game/game-session';
import type { IBallPoolPhysics } from '../game/ball-pool-physics';
import type { SceneAPI } from './scene';
import { BALL_Y, TABLE_Y } from '../physics/constants';

const _BALL_SCENE_Y = (BALL_Y - TABLE_Y) / 10000;

// Speed options: delay in ms between shots
const _SPEEDS: Array<{ label: string; ms: number }> = [
  { label: '0.5×', ms: 2000 },
  { label: '1×',   ms: 1000 },
  { label: '2×',   ms: 500 },
  { label: '4×',   ms: 250 },
  { label: '10×',  ms: 100 },
];

export interface ReplayHUD {
  readonly element: HTMLElement;
  /**
   * Enter replay mode. Resets the session to initial state and begins in paused state.
   * Overrides session.onTurnChanged — caller must not set it after calling start().
   */
  start(
    session: IGameSession,
    physics: IBallPoolPhysics,
    scene: SceneAPI,
    shots: RecordedShot[],
  ): void;
  dispose(): void;
}

export function createReplayHUD(container: HTMLElement): ReplayHUD {
  // ── DOM ──────────────────────────────────────────────────────────────────────

  const el = document.createElement('div');
  el.id = 'replay-hud';
  el.style.cssText = [
    'position:absolute', 'bottom:0', 'left:0', 'right:0',
    'background:rgba(0,0,0,0.78)', 'color:#fff',
    'font-family:monospace', 'font-size:13px',
    'display:none', 'flex-direction:column',
    'padding:10px 16px 14px', 'gap:8px', 'z-index:150',
    'user-select:none',
  ].join(';');

  const btnStyle = 'padding:4px 10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:14px;';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span style="opacity:0.55;font-size:11px;letter-spacing:1px;">REPLAY</span>
      <button id="rh-rst"  style="${btnStyle}" title="Reset to start">⏮</button>
      <button id="rh-bk"   style="${btnStyle}" title="Step back one shot">◀</button>
      <button id="rh-pp"   style="${btnStyle}" title="Play / Pause">▶</button>
      <button id="rh-fwd"  style="${btnStyle}" title="Step forward one shot">▶|</button>
      <select id="rh-spd"  style="background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:3px 6px;cursor:pointer;">
        ${_SPEEDS.map((s, i) => `<option value="${s.ms}"${i === 1 ? ' selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <span id="rh-pos" style="margin-left:auto;opacity:0.8;min-width:60px;text-align:right;">— / —</span>
    </div>
    <input id="rh-seek" type="range" min="0" value="0"
      style="width:100%;accent-color:#4caf50;cursor:pointer;">
  `;
  container.appendChild(el);

  const $pp   = el.querySelector('#rh-pp')   as HTMLButtonElement;
  const $bk   = el.querySelector('#rh-bk')   as HTMLButtonElement;
  const $fwd  = el.querySelector('#rh-fwd')  as HTMLButtonElement;
  const $rst  = el.querySelector('#rh-rst')  as HTMLButtonElement;
  const $spd  = el.querySelector('#rh-spd')  as HTMLSelectElement;
  const $pos  = el.querySelector('#rh-pos')  as HTMLElement;
  const $seek = el.querySelector('#rh-seek') as HTMLInputElement;

  // ── State ─────────────────────────────────────────────────────────────────────

  let _session: IGameSession | null = null;
  let _physics: IBallPoolPhysics | null = null;
  let _scene: SceneAPI | null = null;
  let _shots: RecordedShot[] = [];
  let _nextIdx = 0;      // index of next shot to play (0-based)
  let _playing = false;
  let _timer: ReturnType<typeof setTimeout> | null = null;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _delay(): number { return parseInt($spd.value, 10); }

  function _updateUI(): void {
    const pos = _nextIdx;
    const total = _shots.length;
    $pos.textContent = `${pos} / ${total}`;
    $seek.max = String(total);
    $seek.value = String(pos);
    $pp.textContent = _playing ? '⏸' : '▶';
    $pp.title = _playing ? 'Pause' : 'Play';
    $fwd.disabled = pos >= total;
    $bk.disabled  = pos === 0;
    $rst.disabled  = pos === 0;
  }

  // Sync scene ball positions/visibility from current physics state.
  function _syncSceneFromPhysics(): void {
    if (!_physics || !_scene) return;
    for (const b of _physics.allBalls) {
      _scene.updateBallPosition(
        b.id,
        b.position.x / 10000,
        _BALL_SCENE_Y,
        b.position.z / 10000,
      );
      const mesh = _scene.balls[b.id];
      if (mesh) mesh.visible = !b.isOutOfTable;
    }
  }

  function _clearTimer(): void {
    if (_timer !== null) { clearTimeout(_timer); _timer = null; }
  }

  // Fire the shot at _nextIdx (and advance the index).
  function _doFireShot(): void {
    if (!_session || !_physics || _nextIdx >= _shots.length || _session.isGameEnded) {
      _playing = false; _updateUI(); return;
    }
    const shot = _shots[_nextIdx++];

    // Use live session.isBallInHand (rule-engine state) rather than cueBallPlaced
    // inference — cueBallPlaced=null cannot distinguish "no BIH" from "BIH but AI
    // did not move the cue ball" (cueBallNewPos=null).
    if (_session.isBallInHand) {
      if (shot.cueBallPlaced) _physics.placeBall(0, shot.cueBallPlaced);
      // no placeBall if cueBallPlaced=null (AI kept cue ball where it was)
      const saved = _session.onTurnChanged;
      _session.onTurnChanged = null;
      _session.notifyBallPlaced();
      _session.onTurnChanged = saved;
    }
    _session.forceShot(shot.shotData);
    _updateUI();
  }

  function _scheduleNext(): void {
    _clearTimer();
    _timer = setTimeout(() => { if (_playing) _doFireShot(); }, _delay());
  }

  // Jump to a specific position (0 = initial state, n = after shot n-1).
  // Always replays from startNewGame + shots[0..target-1] headlessly so that
  // BOTH physics and rule-engine state are correctly rewound.  The .poolrecord
  // format excludes ruleState to keep file size down, so setStateFromString-only
  // seek would leave the rule engine in a stale/wrong phase.
  function _seekTo(position: number): void {
    _clearTimer();
    if (!_session || !_physics || !_scene) return;
    const target = Math.max(0, Math.min(position, _shots.length));

    // Suppress all session callbacks during headless replay-from-start so that
    // game-over UI, reason banners, and turn-change scheduling don't fire.
    const savedOnTurnChanged   = _session.onTurnChanged;
    const savedOnGameEnded     = _session.onGameEnded;
    const savedOnReasonMessage = _session.onReasonMessage;
    const savedOnShotFired     = _session.onShotFired;
    _session.onTurnChanged   = null;
    _session.onGameEnded     = null;
    _session.onReasonMessage = null;
    _session.onShotFired     = null;

    _session.startNewGame();

    for (let i = 0; i < target; i++) {
      if (_session.isGameEnded) break;
      const s = _shots[i];
      // Use live isBallInHand (not cueBallPlaced inference) — cueBallPlaced=null
      // cannot distinguish "no BIH" from "BIH but AI kept cue ball in place".
      if (_session.isBallInHand) {
        if (s.cueBallPlaced) _physics.placeBall(0, s.cueBallPlaced);
        _session.notifyBallPlaced();  // transitions BallInHand → Aiming
      }
      _session.forceShot(s.shotData);
    }

    _syncSceneFromPhysics();
    _nextIdx = target;
    // session.isBallInHand now reflects correct live rule-engine state for the next
    // shot; _doFireShot reads it directly — no cached flag needed here.

    _session.onShotFired     = savedOnShotFired;
    _session.onReasonMessage = savedOnReasonMessage;
    _session.onGameEnded     = savedOnGameEnded;
    _session.onTurnChanged   = savedOnTurnChanged;

    _updateUI();

    if (_playing && _nextIdx < _shots.length) _scheduleNext();
  }

  // ── Playback control ──────────────────────────────────────────────────────────

  function _play(): void {
    if (_playing || _nextIdx >= _shots.length) return;
    _playing = true;
    _updateUI();
    _scheduleNext();
  }

  function _pause(): void {
    _clearTimer();
    _playing = false;
    _updateUI();
  }

  // ── Button wiring ─────────────────────────────────────────────────────────────

  $pp.addEventListener('click', () => { if (_playing) _pause(); else _play(); });
  $fwd.addEventListener('click', () => { _pause(); _doFireShot(); });
  $bk.addEventListener('click', () => { _pause(); _seekTo(_nextIdx - 1); });
  $rst.addEventListener('click', () => { _pause(); _seekTo(0); });
  $spd.addEventListener('change', () => { if (_playing) { _clearTimer(); _scheduleNext(); } });

  // Seek slider: pause on input, seek on change
  let _isSeeking = false;
  $seek.addEventListener('pointerdown', () => { _isSeeking = true; _pause(); });
  $seek.addEventListener('input', () => { if (_isSeeking) _pause(); });
  $seek.addEventListener('pointerup', () => {
    _isSeeking = false;
    _seekTo(parseInt($seek.value, 10));
  });

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    get element() { return el; },

    start(session, physics, scene, shots): void {
      _session = session;
      _physics = physics;
      _scene = scene;
      _shots = shots;
      _nextIdx = 0;
      _playing = false;

      $seek.max = String(shots.length);
      el.style.display = 'flex';

      // Wire onTurnChanged: update UI and schedule next shot if playing.
      // Must be set BEFORE _seekTo(0) restores it.
      session.onTurnChanged = (_pi, _bih) => {
        _updateUI();
        if (_playing && _nextIdx < _shots.length) _scheduleNext();
      };

      // Reset to initial rack in paused mode.  _seekTo suppresses callbacks during
      // startNewGame so the turn-change handler doesn't fire prematurely.
      _seekTo(0);
    },

    dispose(): void {
      _clearTimer();
      el.remove();
    },
  };
}
