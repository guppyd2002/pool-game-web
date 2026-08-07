/**
 * Human vs AI wiring (W1–W6) — session-level turn driver tests.
 * Production factory: createBallPool8Session + attachHumanVsAI (no parallel table).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBallPool8Session } from '../../game/game-session';
import type { GameSessionDeps } from '../../game/game-session';
import { createBallPoolPhysics } from '../../game/ball-pool-physics';
import type { IBallPoolPhysics, ShotResult, BallState, AimHit, PhysicsConstants } from '../../game/ball-pool-physics';
import type { CueController } from '../../game/cue-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import {
  attachHumanVsAI,
  shouldRunShotTimer,
  HUMAN_VS_AI_DEFAULTS,
  deriveAiShotSeed,
  AI_SHOT_SEED_STRIDE,
} from '../../game/human-vs-ai';
import { createPoolTable } from '../../game/table-setup';
import { calculateAIShot } from '../../game/ai-controller';
import { CmVector } from '../../physics/cm-vector';
import * as THREE from 'three';

// ─── Shot factories ──────────────────────────────────────────────────────────

function noShot(): ShotResult {
  return { pocketed: [], outOfTable: [], contacts: [], frames: [], finalStates: [] };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

function makeMesh(): THREE.Mesh {
  const m = new THREE.Mesh();
  m.visible = true;
  return m;
}

function makeScene(count = 16): SceneAPI {
  return {
    balls: Array.from({ length: count }, makeMesh),
    camera: null as unknown as THREE.PerspectiveCamera,
    renderer: null as unknown as THREE.WebGLRenderer,
    scene: null as unknown as THREE.Scene,
    table: null as unknown as THREE.Group,
    lights: [],
    updateBallPosition: vi.fn(),
    updateBallRotation: vi.fn(),
    setOrthoTop: vi.fn(),
    dispose: vi.fn(),
    toggleColliders: vi.fn(),
  } as unknown as SceneAPI;
}

function makePhysics(applyResult: ShotResult = noShot()): IBallPoolPhysics & {
  applyShot: ReturnType<typeof vi.fn>;
  placeBall: ReturnType<typeof vi.fn>;
  respotCueBall: ReturnType<typeof vi.fn>;
} {
  const ball = {
    id: 0,
    position: CmVector.zero,
    velocity: CmVector.zero,
    angularVelocity: CmVector.zero,
    isPocketed: false,
    isOutOfTable: false,
  } as unknown as BallState;
  return {
    applyShot: vi.fn().mockReturnValue(applyResult),
    placeBall: vi.fn(),
    respotCueBall: vi.fn(),
    getBall: vi.fn().mockReturnValue(ball),
    getBalls: vi.fn().mockReturnValue([ball]),
    isSimulating: false,
    predictAimLine: vi.fn().mockReturnValue(null as AimHit | null),
    resetToStartState: vi.fn(),
    getConstants: vi.fn().mockReturnValue({} as PhysicsConstants),
    getSpace: vi.fn(),
    // attachHumanVsAI chains onShotFired → _emitShotFired needs state string.
    getStateAsString: vi.fn().mockReturnValue(''),
    setStateFromString: vi.fn(),
    getPhysicsConstants: vi.fn().mockReturnValue({} as PhysicsConstants),
    getActiveBalls: vi.fn().mockReturnValue([ball]),
    allBalls: [ball],
    shotFrames: [],
    step: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as IBallPoolPhysics & {
    applyShot: ReturnType<typeof vi.fn>;
    placeBall: ReturnType<typeof vi.fn>;
    respotCueBall: ReturnType<typeof vi.fn>;
  };
}

function makeCue(): CueController {
  let enabled = true;
  return {
    phase: 'idle',
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    onDragEnd: vi.fn().mockReturnValue(false),
    cancel: vi.fn(),
    getPowerFraction: () => 0,
    getAimHit: () => null,
    hasEnergy: () => true,
    dragDistToForce: () => 0,
    setSpinOffset: vi.fn(),
    getSpinOffset: () => ({ x: 0, y: 0 }),
    setVerticalAngle: vi.fn(),
    getVerticalAngle: () => 0,
    get isEnabled() { return enabled; },
    enable: vi.fn(() => { enabled = true; }),
    disable: vi.fn(() => { enabled = false; }),
    fireNow: vi.fn(function (this: CueController) {
      if (!enabled) return false;
      return false;
    }),
    resetForNewTurn: vi.fn(() => { enabled = true; }),
    aimLineVisible: true,
    toggleAimLine: vi.fn(),
    onShotApplied: null,
    onShotData: null,
  } as unknown as CueController;
}

function makeReplay(): ReplayDriver & { triggerComplete: () => void } {
  let cb: (() => void) | null = null;
  return {
    watch: vi.fn((_p, _s, _pk, _o, onDone: () => void) => { cb = onDone; }),
    resetVisibility: vi.fn(),
    dispose: vi.fn(),
    triggerComplete() { cb?.(); cb = null; },
  } as unknown as ReplayDriver & { triggerComplete: () => void };
}

function setup() {
  const physics = makePhysics(noShot());
  const cue = makeCue();
  const scene = makeScene();
  const replayDriver = makeReplay();
  // Production table factory (no parallel desk) so calculateAIShot has real balls.
  const space = createPoolTable();
  const deps: GameSessionDeps = { physics, cue, scene, replayDriver };
  const session = createBallPool8Session(deps);
  return { physics, cue, scene, replayDriver, space, session };
}

// ─── shouldRunShotTimer ──────────────────────────────────────────────────────

describe('shouldRunShotTimer (W3 — no AI wall-clock foul)', () => {
  it('true for human seat, false for AI seat', () => {
    expect(shouldRunShotTimer(0, 1)).toBe(true);
    expect(shouldRunShotTimer(1, 1)).toBe(false);
    expect(shouldRunShotTimer(0, 0)).toBe(false);
    expect(shouldRunShotTimer(1, 0)).toBe(true);
  });
});

describe('deriveAiShotSeed (self-play parity)', () => {
  it('matches REC-1 formula base + shotIndex * 7919', () => {
    expect(AI_SHOT_SEED_STRIDE).toBe(7919);
    expect(deriveAiShotSeed(42, 0)).toBe(42);
    expect(deriveAiShotSeed(42, 1)).toBe(42 + 7919);
    expect(deriveAiShotSeed(42, 2)).toBe(42 + 2 * 7919);
  });

  it('successive shot seeds are not consecutive integers', () => {
    const a = deriveAiShotSeed(100, 0);
    const b = deriveAiShotSeed(100, 1);
    expect(b - a).toBe(7919);
    expect(b).not.toBe(a + 1);
  });
});

// ─── attachHumanVsAI ─────────────────────────────────────────────────────────

describe('attachHumanVsAI', () => {
  let scheduled: Array<{ fn: () => void; ms: number }> = [];

  beforeEach(() => {
    scheduled = [];
  });

  afterEach(() => {
    scheduled = [];
  });

  function injectTimers() {
    return {
      setTimeoutFn: (fn: () => void, ms: number) => {
        const id = { id: scheduled.length } as unknown as ReturnType<typeof setTimeout>;
        scheduled.push({ fn, ms });
        return id;
      },
      clearTimeoutFn: vi.fn(),
    };
  }

  function flushAll(): void {
    const batch = scheduled.splice(0);
    for (const s of batch) s.fn();
  }

  it('defaults: aiSeat=1, aiRank=3, rankLast=5', () => {
    expect(HUMAN_VS_AI_DEFAULTS.aiSeat).toBe(1);
    expect(HUMAN_VS_AI_DEFAULTS.aiRank).toBe(3);
    expect(HUMAN_VS_AI_DEFAULTS.rankLast).toBe(5);
  });

  it('human turn (P0): onHumanTurn fires; AI does not forceShot', () => {
    const { session, physics, space } = setup();
    const onHuman = vi.fn();
    const onAi = vi.fn();
    attachHumanVsAI(session, physics, space, { turnDelayMs: 0, ...injectTimers() }, {
      onHumanTurn: onHuman,
      onAiTurn: onAi,
    });
    session.startNewGame(); // P0 human, no BIH
    expect(onHuman).toHaveBeenCalledWith(0, false);
    expect(onAi).not.toHaveBeenCalled();
    flushAll();
    expect(physics.applyShot).not.toHaveBeenCalled();
  });

  it('AI turn after break foul: onAiTurn + forceShot after delay', () => {
    const { session, physics, space, replayDriver, cue } = setup();
    const onHuman = vi.fn();
    const onAi = vi.fn();
    attachHumanVsAI(
      session,
      physics,
      space,
      { turnDelayMs: 50, seed: 7, ...injectTimers() },
      {
        onHumanTurn: onHuman,
        onAiTurn: (idx, bih) => {
          onAi(idx, bih);
          cue.disable(); // main.ts responsibility
        },
      },
    );
    session.startNewGame();
    onHuman.mockClear();

    // Human break foul → P1 ball-in-hand
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(0, 0, 1000),
      torque: CmVector.zero,
    });
    replayDriver.triggerComplete();

    expect(session.currentPlayerIndex).toBe(1);
    expect(onAi).toHaveBeenCalledWith(1, true);
    expect(cue.disable).toHaveBeenCalled();

    // First schedule: turn delay; then BIH place + second schedule for forceShot
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
    physics.applyShot.mockClear();
    // Flush turn delay → doAiShot BIH path schedules forceShot
    flushAll();
    // placeBall or respot should have been called
    expect(physics.placeBall.mock.calls.length + physics.respotCueBall.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Flush BIH settle → forceShot
    flushAll();
    expect(physics.applyShot).toHaveBeenCalled();
  });

  it('W3 input leak: AI turn + cue disabled → fireNow false, applyShot not from human', () => {
    const { session, physics, space, replayDriver, cue } = setup();
    attachHumanVsAI(session, physics, space, { turnDelayMs: 9999, ...injectTimers() }, {
      onAiTurn: () => { cue.disable(); },
    });
    session.startNewGame();
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(0, 0, 1000),
      torque: CmVector.zero,
    });
    replayDriver.triggerComplete(); // → AI turn, cue disabled, delay pending (not flushed)

    physics.applyShot.mockClear();
    const fired = cue.fireNow(0.8);
    expect(fired).toBe(false);
    expect(physics.applyShot).not.toHaveBeenCalled();
    // Session still aiming (or BIH) for AI — human fire did not advance shot pipeline
    const phase = session.store.getState().phase;
    expect(phase === 'Aiming' || phase === 'BallInHand').toBe(true);
  });

  it('W3 BIH human direction: AI foul path leaves human with ballInHand hook', () => {
    // After AI plays and fouls, human gets BIH — onHumanTurn(0, true)
    const { session, physics, space, replayDriver } = setup();
    const turns: Array<{ who: string; bih: boolean }> = [];
    attachHumanVsAI(session, physics, space, { turnDelayMs: 0, bihSettleMs: 0, seed: 2, ...injectTimers() }, {
      onHumanTurn: (_i, bih) => turns.push({ who: 'H', bih }),
      onAiTurn: (_i, bih) => turns.push({ who: 'A', bih }),
    });
    session.startNewGame();
    turns.length = 0;

    // Break foul → AI BIH
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(1000, 0, 0),
      torque: CmVector.zero,
    });
    replayDriver.triggerComplete();
    expect(turns.some((t) => t.who === 'A' && t.bih)).toBe(true);

    // Flush AI BIH place + shot (break foul style again → turn back to human BIH)
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValue(noShot());
    flushAll(); // turn delay → BIH place schedules forceShot
    flushAll(); // forceShot
    replayDriver.triggerComplete();

    // After AI foul, human should get turn with BIH
    expect(session.currentPlayerIndex).toBe(0);
    expect(turns.filter((t) => t.who === 'H' && t.bih).length).toBeGreaterThanOrEqual(1);
  });

  it('isAiTurn / isAiSeat helpers', () => {
    const { session, physics, space } = setup();
    const ctrl = attachHumanVsAI(session, physics, space, { ...injectTimers() });
    session.startNewGame();
    expect(ctrl.isAiSeat(1)).toBe(true);
    expect(ctrl.isAiSeat(0)).toBe(false);
    expect(ctrl.isAiTurn()).toBe(false);
  });

  it('dispose clears pending AI schedules', () => {
    const { session, physics, space, replayDriver } = setup();
    const clearTimeoutFn = vi.fn();
    const timers = injectTimers();
    const ctrl = attachHumanVsAI(session, physics, space, {
      turnDelayMs: 5000,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn,
    });
    session.startNewGame();
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(0, 0, 1000),
      torque: CmVector.zero,
    });
    replayDriver.triggerComplete();
    expect(scheduled.length).toBeGreaterThan(0);
    ctrl.dispose();
    expect(clearTimeoutFn).toHaveBeenCalled();
  });
});

describe('shouldRunShotTimer integration with attach hooks', () => {
  it('main pattern: AI turn never starts timer', () => {
    const aiSeat = 1 as 0 | 1;
    const timerStarts: number[] = [];
    const onHumanTurn = (idx: 0 | 1) => {
      if (shouldRunShotTimer(idx, aiSeat)) timerStarts.push(idx);
    };
    const onAiTurn = (idx: 0 | 1) => {
      // must NOT start timer
      if (shouldRunShotTimer(idx, aiSeat)) timerStarts.push(idx);
    };
    onHumanTurn(0);
    onAiTurn(1);
    expect(timerStarts).toEqual([0]);
  });
});

// ─── Real-physics smoke: human-vs-AI short game (W6 / DIV-001 feel) ──────────

describe('human-vs-AI real physics smoke', () => {
  it('W6: completes or advances multi-turn with attachHumanVsAI + production table', () => {
    const space = createPoolTable();
    const base = createBallPoolPhysics(space, makeScene());
    let lastResult: ShotResult | null = null;
    const physics: IBallPoolPhysics = {
      applyShot(sd) {
        const r = base.applyShot(sd);
        lastResult = r;
        return r;
      },
      get shotFrames() { return base.shotFrames; },
      getBall: (id) => base.getBall(id),
      getActiveBalls: () => base.getActiveBalls(),
      get allBalls() { return base.allBalls; },
      predictAimLine: (a, b) => base.predictAimLine(a, b),
      step: (dt) => base.step(dt),
      start: () => base.start(),
      stop: () => base.stop(),
      get isSimulating() { return base.isSimulating; },
      getStateAsString: () => base.getStateAsString(),
      setStateFromString: (s) => base.setStateFromString(s),
      resetToStartState: () => base.resetToStartState(),
      getPhysicsConstants: () => base.getPhysicsConstants(),
      placeBall: (id, p) => base.placeBall(id, p),
      respotCueBall: () => base.respotCueBall(),
    };
    const replayDriver: ReplayDriver = {
      watch(_p, _s, _a, _b, done) { done(); },
      resetVisibility: () => {},
      dispose: () => {},
    };
    const session = createBallPool8Session({
      physics, cue: makeCue(), scene: makeScene(), replayDriver,
    });

    const scheduled: Array<() => void> = [];
    let shotCount = 0;
    let winner: 0 | 1 | null = null;
    let fouls = 0;
    const turnLog: Array<{ seat: number; bih: boolean }> = [];

    session.onGameEnded = (w) => { winner = w; };

    attachHumanVsAI(
      session,
      physics,
      space,
      {
        aiSeat: 1,
        aiRank: 3,
        rankLast: 5,
        seed: 42,
        turnDelayMs: 0,
        bihSettleMs: 0,
        setTimeoutFn: (fn) => {
          scheduled.push(fn);
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn: () => {},
      },
      {
        onHumanTurn: (i, bih) => {
          turnLog.push({ seat: i, bih });
          if (bih) fouls++;
        },
        onAiTurn: (i, bih) => {
          turnLog.push({ seat: i, bih });
          if (bih) fouls++;
        },
      },
    );

    session.startNewGame();

    const MAX = 40;
    let stall = 0;
    while (!session.isGameEnded && shotCount < MAX && stall < 5) {
      const before = shotCount;
      // Drain AI timers (may chain BIH settle)
      while (scheduled.length > 0) {
        const fn = scheduled.shift()!;
        fn();
      }
      if (session.isGameEnded) break;

      if (session.currentPlayerIndex === 0) {
        const bih = session.isBallInHand;
        const aiShot = calculateAIShot(
          space,
          session.getAllowableFn(),
          bih,
          shotCount === 0,
          3,
          5,
          deriveAiShotSeed(42, shotCount),
        );
        if (bih) {
          if (aiShot.cueBallNewPos) physics.placeBall(0, aiShot.cueBallNewPos);
          else physics.respotCueBall();
          session.notifyBallPlaced();
        }
        session.forceShot(aiShot.shotData);
        shotCount++;
        stall = 0;
      } else {
        // Wait for AI flush; if nothing scheduled, count stall
        if (scheduled.length === 0) stall++;
      }
      if (shotCount === before && session.currentPlayerIndex === 1 && scheduled.length === 0) {
        // AI shot may have completed inside flush without incrementing shotCount
        shotCount++;
      }
      void lastResult;
    }

    expect(turnLog.length).toBeGreaterThanOrEqual(2);
    expect(shotCount).toBeGreaterThanOrEqual(1);
    // DIV-001 feel: first human turn after start is NOT BIH (open break);
    // first foul typically lands after break if no 4-rail/pocket (DIV-001).
    expect(turnLog[0]).toEqual({ seat: 0, bih: false });
    console.log(
      `HVAI-smoke seed=42 shots≈${shotCount} turns=${turnLog.length} fouls=${fouls} winner=${winner} ended=${session.isGameEnded} turn0=${JSON.stringify(turnLog[0])} turn1=${JSON.stringify(turnLog[1])}`,
    );
  }, 60000);
});

