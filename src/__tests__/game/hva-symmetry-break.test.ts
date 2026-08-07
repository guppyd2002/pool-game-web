/**
 * Pin: HVA vs self-play quality gap is mechanism (A) — symmetry break — not foul undercount.
 *
 * Self-play r3v3: both seats share GLOBAL shot index for PRNG seeds
 *   seed_i = base + i * 7919, isFirstShot only for i===0.
 *
 * HVA attachHumanVsAI:
 *   - AI-LOCAL shot index starting at 0 (INTENTIONAL — first AI seed reuses base).
 *     Do not "fix" to global alignment; that re-symmetrizes the harness.
 *   - isFirstShot is GAME-level: after human break, AI first shot isFirstShot===false
 *     (break-placement PRNG must not run on AI's opening turn).
 *
 * Foul counting: both use onTurnChanged(bih=true) — same definition.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBallPool8Session } from '../../game/game-session';
import type { GameSessionDeps } from '../../game/game-session';
import type { IBallPoolPhysics, ShotResult, BallState, AimHit, PhysicsConstants } from '../../game/ball-pool-physics';
import type { CueController } from '../../game/cue-controller';
import type { SceneAPI } from '../../renderer/scene';
import type { ReplayDriver } from '../../renderer/replay-driver';
import {
  attachHumanVsAI,
  deriveAiShotSeed,
} from '../../game/human-vs-ai';
import { createPoolTable } from '../../game/table-setup';
import * as AiController from '../../game/ai-controller';
import { CmVector } from '../../physics/cm-vector';
import * as THREE from 'three';

describe('HVA vs self-play seed / isFirstShot asymmetry (mechanism A)', () => {
  it('self-play schedule: global index, single isFirst at shot 0', () => {
    const base = 0;
    const global = [0, 1, 2, 3].map((i) => ({
      global: i,
      seed: deriveAiShotSeed(base, i),
      isFirst: i === 0,
    }));
    expect(global[0]).toEqual({ global: 0, seed: 0, isFirst: true });
    expect(global[1]).toEqual({ global: 1, seed: 7919, isFirst: false });
    expect(global[2]).toEqual({ global: 2, seed: 15838, isFirst: false });
  });

  it('HVA AI-local seed: first AI shot reuses base even if global>0 (INTENTIONAL)', () => {
    const base = 0;
    // Human already took global shots 0 and 1 (break + continuation).
    const humanSeeds = [0, 1].map((g) => deriveAiShotSeed(base, g));
    // AI-local shotCount starts at 0 inside attachHumanVsAI — deliberate.
    const aiFirstLocal = 0;
    const aiFirstSeed = deriveAiShotSeed(base, aiFirstLocal);

    expect(humanSeeds[0]).toBe(0);
    expect(aiFirstSeed).toBe(0); // SAME as human break seed — not global 2 * 7919
    expect(aiFirstSeed).not.toBe(deriveAiShotSeed(base, 2)); // self-play would use 15838
  });

  it('seat seed streams diverge: self-play shares one sequence; HVA AI restarts at 0', () => {
    const base = 42;
    const selfPlayAiShotsIfSeatsWere_0_0_0_1_1 = [
      deriveAiShotSeed(base, 3),
      deriveAiShotSeed(base, 4),
    ];
    const hvaAiLocal = [
      deriveAiShotSeed(base, 0),
      deriveAiShotSeed(base, 1),
    ];
    expect(hvaAiLocal[0]).not.toBe(selfPlayAiShotsIfSeatsWere_0_0_0_1_1[0]);
    expect(hvaAiLocal[0]).toBe(base);
  });
});

// ─── Integration: human break → AI first shot isFirstShot===false ────────────

function noShot(): ShotResult {
  return { pocketed: [], outOfTable: [], contacts: [], frames: [], finalStates: [] };
}

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
    // Required when onShotFired is wired (attachHumanVsAI chains it for isFirstShot).
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
    fireNow: vi.fn(() => false),
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

describe('HVA isFirstShot game-level (CEO first AI impression)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('after human break, AI first calculateAIShot receives isFirstShot===false', () => {
    const physics = makePhysics(noShot());
    const cue = makeCue();
    const scene = makeScene();
    const replayDriver = makeReplay();
    const space = createPoolTable();
    const deps: GameSessionDeps = { physics, cue, scene, replayDriver };
    const session = createBallPool8Session(deps);

    const scheduled: Array<{ fn: () => void; ms: number }> = [];
    const seenIsFirst: boolean[] = [];
    const seenSeeds: number[] = [];

    const spy = vi.spyOn(AiController, 'calculateAIShot').mockImplementation(
      (_space, _allow, isFirst, bih, _rank, _rankLast, seed) => {
        seenIsFirst.push(isFirst);
        seenSeeds.push(seed);
        // Minimal legal AI result for forceShot path
        return {
          shotData: {
            position: CmVector.zero,
            impulse: new CmVector(0, 0, 1000),
            torque: CmVector.zero,
          },
          cueBallNewPos: bih ? new CmVector(-5000, 0, 0) : null,
        };
      },
    );

    attachHumanVsAI(
      session,
      physics,
      space,
      {
        aiSeat: 1,
        seed: 0,
        turnDelayMs: 0,
        bihSettleMs: 0,
        setTimeoutFn: (fn, ms) => {
          scheduled.push({ fn, ms });
          return scheduled.length as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn: vi.fn(),
      },
    );

    session.startNewGame(); // P0 human, isFirstShot still true until first settle

    // Human break foul → turn to AI with BIH
    (physics.applyShot as ReturnType<typeof vi.fn>).mockReturnValueOnce(noShot());
    session.forceShot({
      position: CmVector.zero,
      impulse: new CmVector(0, 0, 1000),
      torque: CmVector.zero,
    });
    // onShotFired already cleared game-level isFirstShot during forceShot
    replayDriver.triggerComplete();

    expect(session.currentPlayerIndex).toBe(1);
    // Drain turn delay → doAiShot
    while (scheduled.length > 0) {
      const batch = scheduled.splice(0);
      for (const s of batch) s.fn();
    }

    expect(spy).toHaveBeenCalled();
    expect(seenIsFirst[0]).toBe(false); // was true pre-fix (CEO bug)
    // Seed stream intentionally still AI-local base reuse
    expect(seenSeeds[0]).toBe(0);
  });

  it('AI opening break (aiSeat=0) still gets isFirstShot===true on first shot', () => {
    const physics = makePhysics(noShot());
    const cue = makeCue();
    const scene = makeScene();
    const replayDriver = makeReplay();
    const space = createPoolTable();
    const session = createBallPool8Session({ physics, cue, scene, replayDriver });

    const scheduled: Array<() => void> = [];
    const seenIsFirst: boolean[] = [];

    vi.spyOn(AiController, 'calculateAIShot').mockImplementation(
      (_s, _a, isFirst, bih, _rank, _rankLast, _seed) => {
        seenIsFirst.push(isFirst);
        return {
          shotData: {
            position: CmVector.zero,
            impulse: new CmVector(1000, 0, 0),
            torque: CmVector.zero,
          },
          cueBallNewPos: bih ? new CmVector(-5000, 0, 0) : null,
        };
      },
    );

    attachHumanVsAI(
      session,
      physics,
      space,
      {
        aiSeat: 0, // AI opens
        seed: 1,
        turnDelayMs: 0,
        bihSettleMs: 0,
        setTimeoutFn: (fn) => {
          scheduled.push(fn);
          return 0 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeoutFn: vi.fn(),
      },
    );

    session.startNewGame(); // fires onTurnChanged(0) → AI schedules break
    while (scheduled.length > 0) scheduled.shift()!();

    expect(seenIsFirst[0]).toBe(true);
  });
});
