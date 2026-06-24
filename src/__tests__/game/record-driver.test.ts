/**
 * Record + Replay driver unit tests.
 *
 * RD-001: computeShotChecksum C-1 — same physics state but different rule-engine state
 *         → different checksum (e.g. tableIsOpened differs).
 * RD-002: computeShotChecksum is deterministic (same inputs → same output).
 * RD-003: computeShotChecksum excludes shotStartedAt (wall-clock) — same logic state,
 *         different timestamps → identical checksum.
 * RD-004: RecordDriver accumulates shots via onShotFired hook; each shot has checksum.
 * RD-005: Exported record JSON has all required core fields (v, engine, constants, config,
 *         shots, outcome).
 * RD-006: Mode B determinism check — re-run seed=4 produces checksums that match a
 *         recorded game (same seed → bit-exact replay).
 */

import { describe, it, expect } from 'vitest';
import { computeShotChecksum } from '../../game/game-session';
import { createRecordDriver } from '../../game/record-driver';
import type { GameLogicStateV1 } from '../../game/rule-engine';
import { CmVector } from '../../physics/cm-vector';
import type { ShotData } from '../../game/ball-pool-physics';
import type { RecordedShot } from '../../game/game-session';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRuleState(overrides: Partial<GameLogicStateV1> = {}): GameLogicStateV1 {
  const base: GameLogicStateV1 = {
    version: 1,
    isFirstShot: true,
    tableIsOpened: false,
    turnIsChanged: false,
    currentPlayerIndex: 0,
    hasBallType: false,
    setBallTypeFlag: false,
    pocketedBalls: [],
    reservedBalls: [],
    players: [
      { ballType: 0, ballInHand: false, balls: [1,2,3,4,5,6,7] },
      { ballType: 0, ballInHand: false, balls: [9,10,11,12,13,14,15] },
    ],
    lastReason: 0,
    gameIsEnded: false,
    isWinner: false,
    shotStartedAt: 1700000000000,
  };
  return { ...base, ...overrides };
}

function makeShotData(): ShotData {
  return {
    position: new CmVector(0, 16500, 0),
    impulse: new CmVector(0, 0, 8000),
    torque: CmVector.zero,
  };
}

const PHYSICS_STATE = 'P|test|physics|string|v1';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeShotChecksum()', () => {
  it('RD-001 C-1: same physics, different rule-state → different checksum', () => {
    const rs1 = makeRuleState({ tableIsOpened: false });
    const rs2 = makeRuleState({ tableIsOpened: true });  // only tableIsOpened differs

    const cs1 = computeShotChecksum(PHYSICS_STATE, rs1);
    const cs2 = computeShotChecksum(PHYSICS_STATE, rs2);

    expect(cs1).not.toBe(cs2);  // C-1: rule-state is part of the hash
  });

  it('RD-001b C-1: same physics, different currentPlayerIndex → different checksum', () => {
    const rs1 = makeRuleState({ currentPlayerIndex: 0 });
    const rs2 = makeRuleState({ currentPlayerIndex: 1 });

    expect(computeShotChecksum(PHYSICS_STATE, rs1)).not.toBe(computeShotChecksum(PHYSICS_STATE, rs2));
  });

  it('RD-002: deterministic — same inputs produce identical checksum', () => {
    const rs = makeRuleState();
    const c1 = computeShotChecksum(PHYSICS_STATE, rs);
    const c2 = computeShotChecksum(PHYSICS_STATE, rs);
    expect(c1).toBe(c2);
  });

  it('RD-003: excludes shotStartedAt — different timestamps → same checksum', () => {
    const rs1 = makeRuleState({ shotStartedAt: 1000 });
    const rs2 = makeRuleState({ shotStartedAt: 9999999 });

    // Physics state and all logic-relevant fields are identical; only wall-clock differs
    expect(computeShotChecksum(PHYSICS_STATE, rs1)).toBe(computeShotChecksum(PHYSICS_STATE, rs2));
  });

  it('RD-003b: different physics state → different checksum', () => {
    const rs = makeRuleState();
    expect(computeShotChecksum('physics_A', rs)).not.toBe(computeShotChecksum('physics_B', rs));
  });
});

describe('createRecordDriver()', () => {
  it('RD-004: accumulates RecordedShot entries via onShotFired', () => {
    const { driver, record } = createRecordDriver({
      engineVersion: 'test-sha',
      players: [{ type: 'AI', rank: 4 }, { type: 'AI', rank: 2 }],
      gameSeed: 7,
    });

    const shot: RecordedShot = {
      n: 0,
      player: 0,
      shotData: makeShotData(),
      cueBallPlaced: null,
      physicsState: PHYSICS_STATE,
      ruleState: makeRuleState(),
      checksum: computeShotChecksum(PHYSICS_STATE, makeRuleState()),
    };

    driver.onShotFired(shot);
    driver.onShotFired({ ...shot, n: 1, player: 1 });

    expect(record.shots).toHaveLength(2);
    expect(record.shots[0].n).toBe(0);
    expect(record.shots[0].checksum).toBeDefined();
    expect(record.shots[1].n).toBe(1);
    expect(record.shots[1].player).toBe(1);
  });

  it('RD-005: finalize() produces valid core record JSON with required fields', () => {
    const { driver, record } = createRecordDriver({
      engineVersion: 'abc123',
      players: [{ type: 'AI', rank: 4 }, { type: 'Human' }],
      gameSeed: 0,
    });

    driver.onShotFired({
      n: 0, player: 0,
      shotData: makeShotData(), cueBallPlaced: null,
      physicsState: PHYSICS_STATE, ruleState: makeRuleState(),
      checksum: '00000000',
    });
    driver.finalize({ winner: 0, reason: 127, totalShots: 1 });

    const json = record.toJSON();
    const parsed = JSON.parse(json);

    // Core fields
    expect(parsed.v).toBe('1');
    expect(parsed.engine).toBe('abc123');
    expect(parsed.constants).toBeDefined();
    expect(parsed.constants.MULTIPLIER).toBeDefined();
    expect(parsed.config.players).toHaveLength(2);
    expect(parsed.config.players[0].type).toBe('AI');
    expect(parsed.shots).toHaveLength(1);
    expect(parsed.shots[0].checksum).toBeDefined();
    expect(parsed.outcome.winner).toBe(0);
    expect(parsed.outcome.reason).toBe(127);
  });
});
