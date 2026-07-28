// @vitest-environment happy-dom
/**
 * Replay seek → rule-engine consistency regression (卡卡西).
 *
 * Guards commit 149d864 fix for the seek rule-desync FAIL:
 *   舊 bug：replay-hud._seekTo 只 setStateFromString 還原 physics、不 rewind
 *   rule engine → seek 後 currentPlayerIndex / isBallInHand / phase 為 stale
 *   → 接著 step-forward 讀到錯誤 rule 狀態，出現 desync 與 step-fwd 死。
 *   fix：_seekTo 改為 startNewGame + forceShot(shots[0..target-1]) headless 重播，
 *   physics 與 rule engine 一起確定性 rewind。
 *
 * 方法（真實元件、非 mock 邏輯）：
 *   1. 用 production table + 真 physics + 真 session 跑一局 headless self-play，
 *      擷取 RecordedShot[] 與「前向播放」的 rule 狀態 ground truth（每個 seek 位置一筆）。
 *   2. 開一個全新 session + 真 ReplayHUD，透過 DOM（seek slider / step 按鈕）驅動 _seekTo。
 *   3. 斷言 seek 到位置 k 後 session 的 rule 狀態 == ground truth[k]（desync 核心）。
 *   4. 斷言 seek 後 step-forward 能推進、狀態正確、無死鎖。
 *
 * 有牙依據：ground truth 由前向播放計算，只還原 physics 的舊 seek 無法讓 rule 狀態
 * （currentPlayerIndex / isBallInHand）對上 ground truth → 舊 code 會 FAIL。
 * 3 支單次 seek 測試為 149d864 single-seek fix 的實時 guard（綠）。
 *
 * ⚠️ KNOWN BUG（卡卡西 於本測試發現，2026-07-10，待鳴人修）：
 *   下方 `it.fails` suite 為 **重複 seek / playAgain desync**。單次 seek 正確，但
 *   第二次以後的導覽（≥3 連續 seek / step-back ◀ / reset ⏮ / 多次拖曳 slider，皆走
 *   _seekTo；以及 game-over→playAgain→再開局）rule 狀態錯亂。
 *   root cause：game-session.startNewGame()（與 playAgain()）只 reset physics + store
 *   （START_GAME），**未 reset ruleEngine**（rule-engine.ts 的 _currentPlayerIndex /
 *   _players[] 群組指派為 persistent state；game-session 從未呼叫 ruleEngine.reset/
 *   deserialize）。_seekTo/playAgain 每次都 startNewGame + 重播，第二次是在殘留 rule
 *   狀態上跑 → 發散。149d864 只修好單次 physics-only seek，未使 rewind 具冪等性。
 *   修法：startNewGame()（與 playAgain()）需 reset ruleEngine 至 pristine 初始態。
 *
 *   千手規格（防「部分 reset」假綠）：KNOWN-BUG 測試斷言 **全 rule 狀態**——輪次、
 *   花色歸屬、ball-in-hand、foul/pending、break、勝負旗標——透過 ruleFingerprint（逐項
 *   deep-equal）+ checksum（physics + 全 deterministic rule 欄位）與 from-start 記錄比對。
 *   任一 reset 欄位遺漏 → 對應測試仍紅。→ 鳴人修好後 `it.fails` 轉「預期失敗卻通過」
 *   報錯，QA 把 it.fails 改回 it、重跑、並做 per-field teeth（逐一拿掉 reset 欄位須 FAIL）
 *   後才判 PASS。
 */

import { describe, it, expect } from 'vitest';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { IBallPoolPhysics, ShotResult } from '../../game/ball-pool-physics';
import type { SceneAPI } from '../../renderer/scene';
import type { CueController } from '../../game/cue-controller';
import type { ReplayDriver } from '../../renderer/replay-driver';
import { createBallPool8Session } from '../../game/game-session';
import type { RecordedShot, IGameSession } from '../../game/game-session';
import { calculateAIShot } from '../../game/ai-controller';
import { createPoolTable } from '../../game/table-setup';
import { createReplayHUD } from '../../renderer/replay-hud';

// ─── Headless mocks (no rendering) — mirror ai-self-play harness ────────────────

const MOCK_SCENE: SceneAPI = {
  updateBallPosition: () => {},
  render: () => {},
  dispose: () => {},
  renderer: null as unknown as import('three').WebGLRenderer,
  camera: null as unknown as import('three').PerspectiveCamera,
  scene: null as unknown as import('three').Scene,
  balls: [] as unknown as import('three').Mesh[],
  table: null as unknown as import('three').Group,
  activeCamera: null as unknown as import('three').Camera,
  setOrthoTop: () => {},
};

const MOCK_CUE: CueController = {
  get onShotApplied() { return null; },
  set onShotApplied(_fn) {},
  disable: () => {}, enable: () => {}, resetForNewTurn: () => {}, cancel: () => {},
  get phase() { return 'idle' as const; },
  get isEnabled() { return false; },
  get aimLineVisible() { return false; },
  onDragStart: () => {}, onDragMove: () => {}, onDragEnd: () => false,
  fireNow: () => false, getPowerFraction: () => 0, getAimHit: () => null,
  hasEnergy: () => false, dragDistToForce: () => 0,
  setSpinOffset: () => {}, getSpinOffset: () => ({ x: 0, y: 0 }),
  setVerticalAngle: () => {}, getVerticalAngle: () => 0, toggleAimLine: () => {},
  getAimState: () => ({ start: null, current: null }), setFineAimCurrent: () => {},
};

function makeSyncReplayDriver(): ReplayDriver {
  return {
    watch(_physics, _scene, _pocketed, _oot, onComplete) { onComplete(); },
    resetVisibility: () => {},
    dispose: () => {},
  };
}

function makeTrackedPhysics(base: IBallPoolPhysics): { physics: IBallPoolPhysics; getLastResult: () => ShotResult | null } {
  let _lastResult: ShotResult | null = null;
  const physics: IBallPoolPhysics = {
    applyShot(shot) { const r = base.applyShot(shot); _lastResult = r; return r; },
    get shotFrames() { return base.shotFrames; },
    getBall(id) { return base.getBall(id); },
    getActiveBalls() { return base.getActiveBalls(); },
    get allBalls() { return base.allBalls; },
    predictAimLine(from, dir) { return base.predictAimLine(from, dir); },
    step(dt) { base.step(dt); }, start() { base.start(); }, stop() { base.stop(); },
    get isSimulating() { return base.isSimulating; },
    getStateAsString() { return base.getStateAsString(); },
    setStateFromString(s) { base.setStateFromString(s); },
    resetToStartState() { base.resetToStartState(); },
    getPhysicsConstants() { return base.getPhysicsConstants(); },
    placeBall(id, pos) { base.placeBall(id, pos); },
    respotCueBall() { base.respotCueBall(); },
  };
  return { physics, getLastResult: () => _lastResult };
}

// ─── Rule-engine observable state (what the desync bug corrupted) ───────────────

interface RuleState {
  bih: boolean;         // ball-in-hand（session _ballInHandActive；foul 的實質後果）
  ended: boolean;
  // 完整 store.getState()：phase / currentPlayerIndex / lastVerdict / winner / lastReason /
  // reasonMessage。store 與 ruleEngine.serialize 是**兩層**狀態，checksum 只涵蓋 physics+rule，
  // 不含 store。千手 coverage audit：若只斷言 phase+player，store 的 winner/lastReason/
  // reasonMessage/lastVerdict 會假綠 → 這裡整包 deep-equal 封洞。
  store: Record<string, unknown>;
  // 花色歸屬 fingerprint：目前玩家可合法擊打哪些代表球（table-open→全物件球可打、
  // 8 不可；指派後→僅本組；清完組→8 可打）。透過公開 getAllowableFn() 讀 live 規則態。
  allow: boolean[];
}

// Representative balls: two solids, two stripes, the 8-ball.
const PROBE_BALLS = [1, 3, 9, 11, 8];

function snapshot(s: IGameSession): RuleState {
  const allowable = s.getAllowableFn();
  return {
    bih: s.isBallInHand,
    ended: s.isGameEnded,
    store: { ...s.store.getState() },  // full store: phase/player/winner/lastReason/reasonMessage/lastVerdict
    allow: PROBE_BALLS.map((id) => allowable(id)),
  };
}

/**
 * Run one deterministic headless AI self-play game and capture its RecordedShot[].
 * (Recording only — the rule-state ground truth is computed separately by
 * forwardTruth() so it is independent of AI-vs-recorded placement drift.)
 */
function generateGame(seed: number, rank0: number, rank1: number, rankLast: number): { shots: RecordedShot[]; ended: boolean } {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  const { physics } = makeTrackedPhysics(base);
  const session = createBallPool8Session({ physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: makeSyncReplayDriver() });

  const shots: RecordedShot[] = [];
  session.onShotFired = (shot) => { shots.push(shot); };

  session.startNewGame();
  let shotCount = 0;
  const MAX = 60;
  while (!session.isGameEnded && shotCount < MAX) {
    const player = session.currentPlayerIndex;
    const allowable = session.getAllowableFn();
    const bih = session.isBallInHand;
    const rank = player === 0 ? rank0 : rank1;
    const aiShot = calculateAIShot(space, allowable, shotCount === 0, bih, rank, rankLast, seed + shotCount * 7919);

    if (bih) {
      if (aiShot.cueBallNewPos !== null) physics.placeBall(0, aiShot.cueBallNewPos);
      session.notifyBallPlaced();
    }
    session.forceShot(aiShot.shotData);
    shotCount++;
  }
  return { shots, ended: session.isGameEnded };
}

/**
 * Independent reference: incrementally forward-replay the recorded shots on a
 * fresh session (same placeBall+notifyBallPlaced+forceShot contract _seekTo uses),
 * snapshotting rule state at every position.
 *   groundTruth[k] = rule state at position k (0 = after startNewGame; k = after shots[0..k-1]).
 * A correct seek to k MUST reproduce groundTruth[k]. The old physics-only seek
 * (restored physics but not rule engine) could not — that is the regression this guards.
 */
function forwardTruth(shots: RecordedShot[]): RuleState[] {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  const { physics } = makeTrackedPhysics(base);
  const session = createBallPool8Session({ physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: makeSyncReplayDriver() });

  session.startNewGame();
  const truth: RuleState[] = [snapshot(session)];  // position 0
  for (let i = 0; i < shots.length; i++) {
    if (session.isGameEnded) { truth.push(snapshot(session)); continue; }
    const s = shots[i];
    if (session.isBallInHand) {
      if (s.cueBallPlaced) physics.placeBall(0, s.cueBallPlaced);
      session.notifyBallPlaced();
    }
    session.forceShot(s.shotData);
    truth.push(snapshot(session));  // position i+1
  }
  return truth;
}

// ─── ReplayHUD DOM driver ──────────────────────────────────────────────────────

function mountReplay(shots: RecordedShot[]): {
  session: IGameSession;
  el: HTMLElement;
  seekTo: (k: number) => void;
  stepFwd: () => void;
  stepBk: () => void;
  reset: () => void;
  stepFireCapture: () => RecordedShot | null;
  position: () => number;
  fwdDisabled: () => boolean;
  cleanup: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  const { physics } = makeTrackedPhysics(base);
  const session = createBallPool8Session({ physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: makeSyncReplayDriver() });

  const hud = createReplayHUD(container);
  hud.start(session, physics, MOCK_SCENE, shots);

  // Capture full RecordedShot (ruleState + checksum) whenever a shot fires via the
  // HUD step controls. _seekTo suppresses onShotFired during its internal replay, so
  // this only captures explicit step-forward fires — exactly what we want to inspect.
  let _lastCaptured: RecordedShot | null = null;
  session.onShotFired = (s) => { _lastCaptured = s; };

  const el = hud.element;
  const $seek = el.querySelector('#rh-seek') as HTMLInputElement;
  const $fwd  = el.querySelector('#rh-fwd')  as HTMLButtonElement;
  const $bk   = el.querySelector('#rh-bk')   as HTMLButtonElement;
  const $rst  = el.querySelector('#rh-rst')  as HTMLButtonElement;

  return {
    session,
    el,
    seekTo(k: number) {
      // Model a real drag: pointerdown starts the gesture (HUD pauses + syncs the
      // slider to the current position), THEN the value moves, THEN pointerup commits.
      // Setting value before pointerdown would be overwritten by the HUD's _updateUI.
      $seek.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      $seek.value = String(k);
      $seek.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    },
    stepFwd() { $fwd.click(); },
    stepBk()  { $bk.click(); },
    reset()   { $rst.click(); },
    /** Step-forward one shot and return the RecordedShot it fired (full rule state + checksum). */
    stepFireCapture(): RecordedShot | null { _lastCaptured = null; $fwd.click(); return _lastCaptured; },
    position() { return parseInt($seek.value, 10); },
    fwdDisabled() { return $fwd.disabled; },
    cleanup() { hud.dispose(); document.body.removeChild(container); },
  };
}

// ─── Full rule-state fingerprint (guards against PARTIAL reset false-green) ────────
// Explicitly names every field 千手 listed so a reset that misses any one FAILs the
// deep-equal. checksum (physics + all deterministic rule fields, minus wall-clock) is
// the combined backstop.

type RS = RecordedShot['ruleState'];

function ruleFingerprint(rs: RS) {
  return {
    turn: rs.currentPlayerIndex,                 // 輪次
    tableOpen: rs.tableIsOpened,                 // break / 開桌
    firstShot: rs.isFirstShot,                   // break
    hasBallType: rs.hasBallType,                 // 花色是否已指派
    p0type: rs.players[0].ballType,              // 花色歸屬 P0
    p0balls: [...rs.players[0].balls],
    p0bih: rs.players[0].ballInHand,             // ball-in-hand P0
    p1type: rs.players[1].ballType,              // 花色歸屬 P1
    p1balls: [...rs.players[1].balls],
    p1bih: rs.players[1].ballInHand,
    reason: rs.lastReason,                        // foul / pending 原因
    ended: rs.gameIsEnded,                        // 勝負
    winner: rs.isWinner,                          // 勝負旗標
  };
}

/**
 * Navigate the HUD to a position, then step-fire the shot at that position and assert
 * the fired shot's FULL rule state (+checksum) equals the canonical from-start record.
 * Firing shot p reproduces shots[p] only if the pre-fire rule engine at position p was
 * correctly (and fully) rewound — so this catches both total and partial reset defects.
 */
function expectFullStateAt(r: ReturnType<typeof mountReplay>, shots: RecordedShot[], p: number): void {
  const cap = r.stepFireCapture();
  expect(cap, `no shot captured stepping at position ${p}`).not.toBeNull();
  expect(ruleFingerprint(cap!.ruleState)).toEqual(ruleFingerprint(shots[p].ruleState));
  expect(cap!.checksum).toBe(shots[p].checksum);
}

// Pure-session helper: fresh session + physics (no HUD).
function freshSession() {
  const space = createPoolTable();
  const base = createBallPoolPhysics(space, MOCK_SCENE);
  const { physics } = makeTrackedPhysics(base);
  const session = createBallPool8Session({ physics, cue: MOCK_CUE, scene: MOCK_SCENE, replayDriver: makeSyncReplayDriver() });
  return { physics, session };
}

// Replay recorded shots forward on an already-started session (mirrors _seekTo body).
function playShots(session: IGameSession, physics: IBallPoolPhysics, shots: RecordedShot[]): void {
  for (const s of shots) {
    if (session.isGameEnded) break;
    if (session.isBallInHand) {
      if (s.cueBallPlaced) physics.placeBall(0, s.cueBallPlaced);
      session.notifyBallPlaced();
    }
    session.forceShot(s.shotData);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

// Deterministic game that actually REACHES game-over — needed so the
// playAgain path has a real GameOver to reset from, and gives ample seek endpoints.
// SP-Harden-7b: SEED=10000 under rank 7v7 no longer ends after 3fa92431 pocket shift
// (cap-hit 200). Probed completers include 100(~24 shots), 1000, 12345, … Keep ranks;
// only reconcile seed to ground truth (same method as SP-Harden-7). Do not hack AI.
const SEED = 100, RANK0 = 7, RANK1 = 7, RANK_LAST = 10;
function genGame(): { shots: RecordedShot[]; ended: boolean } {
  return generateGame(SEED, RANK0, RANK1, RANK_LAST);
}

describe('replay seek → rule-engine consistency (149d864 regression)', () => {
  it('generates a deterministic game that reaches game-over', () => {
    const { shots, ended } = genGame();
    expect(shots.length).toBeGreaterThanOrEqual(8);
    expect(ended).toBe(true);  // playAgain path requires a real game-over
    expect(forwardTruth(shots).length).toBe(shots.length + 1);
  });

  // ── KNOWN-BUG suite (repeated-seek / playAgain desync — see file header) ──────────
  // All `it.fails` until 鳴人 makes startNewGame()/playAgain() reset the rule engine.
  // Assertions cover FULL rule state (ruleFingerprint + checksum) to defeat partial-reset
  // false-green: a reset that misses ANY field keeps these red. On the real fix they flip
  // green → 鳴人 changes `it.fails` back to `it`; the QA acceptance gate re-runs + per-field
  // teeth (drop each reset line → the matching test must FAIL) before PASS.

  it('≥3 consecutive non-monotonic seeks: full rule state at endpoint matches from-start', () => {
    const { shots } = genGame();
    const p = Math.min(5, shots.length - 1);
    const r = mountReplay(shots);
    try {
      for (const k of [6, 2, 7, 3, p]) r.seekTo(Math.min(k, shots.length));  // 5 seeks
      expect(r.position()).toBe(p);
      expect(snapshot(r.session)).toEqual(forwardTruth(shots)[p]);  // direct observable signal
      expectFullStateAt(r, shots, p);                               // full rule state + checksum
    } finally {
      r.cleanup();
    }
  });

  it('step-back (◀) repeatedly: full rule state matches from-start at each stop', () => {
    const { shots } = genGame();
    const start = Math.min(6, shots.length);
    const r = mountReplay(shots);
    try {
      r.seekTo(start);
      for (let pos = start - 1; pos >= Math.max(0, start - 3); pos--) {
        r.stepBk();
        expect(r.position()).toBe(pos);
        expect(snapshot(r.session)).toEqual(forwardTruth(shots)[pos]);  // observable turn/bih/花色 fingerprint
      }
    } finally {
      r.cleanup();
    }
  });

  it('reset (⏮) then re-seek: full rule state matches from-start', () => {
    const { shots } = genGame();
    const p = Math.min(4, shots.length - 1);
    const r = mountReplay(shots);
    try {
      r.seekTo(Math.min(6, shots.length));
      r.reset();                       // ⏮ → position 0
      expect(r.position()).toBe(0);
      r.seekTo(p);
      expect(snapshot(r.session)).toEqual(forwardTruth(shots)[p]);  // direct observable signal
      expectFullStateAt(r, shots, p);
    } finally {
      r.cleanup();
    }
  });

  it('slider dragged many times (multi-drag): full rule state at endpoint matches', () => {
    const { shots } = genGame();
    const p = Math.min(2, shots.length - 1);
    const r = mountReplay(shots);
    try {
      for (const k of [3, 7, 1, 6, p]) r.seekTo(Math.min(k, shots.length));
      expect(snapshot(r.session)).toEqual(forwardTruth(shots)[p]);  // direct observable signal
      expectFullStateAt(r, shots, p);
    } finally {
      r.cleanup();
    }
  });

  it('game-over → playAgain → new game reproduces game-1 per-shot checksums', () => {
    const { shots } = genGame();
    const { physics, session } = freshSession();

    // Game 1: play the recorded shots to completion.
    session.startNewGame();
    playShots(session, physics, shots);

    // playAgain() must fully reset (physics + rule engine) so replaying the SAME inputs
    // yields byte-identical per-shot state. If the rule engine carries over, game-2 diverges.
    session.playAgain();
    const game2: string[] = [];
    session.onShotFired = (s) => { game2.push(s.checksum); };
    playShots(session, physics, shots);

    expect(game2).toEqual(shots.map((s) => s.checksum));
  });

  it('step-forward after seek advances and stays consistent (no step-fwd deadlock)', () => {
    const { shots } = genGame();
    const groundTruth = forwardTruth(shots);
    const N = Math.min(shots.length, 8);
    const r = mountReplay(shots);
    try {
      // Reproduce the original failing flow: seek to start, then step forward through.
      r.seekTo(0);
      expect(snapshot(r.session)).toEqual(groundTruth[0]);
      for (let k = 0; k < N; k++) {
        expect(r.fwdDisabled()).toBe(false);       // button live → not deadlocked
        r.stepFwd();
        expect(r.position()).toBe(k + 1);           // index actually advanced
        expect(snapshot(r.session)).toEqual(groundTruth[k + 1]);
      }
    } finally {
      r.cleanup();
    }
  });

  it('step-forward from a mid-seek fires the correct next shot', () => {
    const { shots } = genGame();
    const groundTruth = forwardTruth(shots);
    const mid = Math.min(3, shots.length - 1);
    const r = mountReplay(shots);
    try {
      r.seekTo(mid);
      expect(snapshot(r.session)).toEqual(groundTruth[mid]);
      expect(r.fwdDisabled()).toBe(false);
      r.stepFwd();
      expect(r.position()).toBe(mid + 1);
      expect(snapshot(r.session)).toEqual(groundTruth[mid + 1]);
    } finally {
      r.cleanup();
    }
  });

});
