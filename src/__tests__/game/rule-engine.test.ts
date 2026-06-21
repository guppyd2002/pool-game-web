/**
 * P1-T03 — 8-Ball Rule Engine tests
 * Each rule mapped to BallPool8GameLogic C# method(s).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRuleEngine } from '../../game/rule-engine';
import { BallType } from '../../game/player-ball-info';
import { Reason } from '../../game/game-play-reason';
import type { ShotResult, ContactEvent } from '../../game/ball-pool-physics';
import { CmVector } from '../../physics/cm-vector';

// ─── Test helpers ────────────────────────────────────────────────────────────

function contact(
  stepIndex: number,
  kind: 'ball' | 'cushion',
  ballId: number,
  other: number | null,
  cushionId: number | null = null,
): ContactEvent {
  return { stepIndex, kind, ballId, otherBallId: other, cushionId };
}

/** Cue-ball first contact with rack ball at step 10 (S4). */
function cueHits(ballId: number): ContactEvent {
  return contact(10, 'ball', 0, ballId);
}

/** Non-cue ball hits a cushion (contributes to hitBoardCount). */
function railHit(ballId: number, step = 20): ContactEvent {
  return contact(step, 'cushion', ballId, null, 1);
}

function pocketed(ballId: number, pocketId = 0, stepIndex = 30) {
  return { ballId, pocketId, stepIndex };
}

function oot(ballId: number, stepIndex = 30) {
  return { ballId, stepIndex };
}

const ZERO_VEC = new CmVector(0, 0, 0);

function makeShotResult(overrides: Partial<ShotResult>): ShotResult {
  return {
    frames: [],
    finalStates: [],
    pocketed: [],
    outOfTable: [],
    contacts: [],
    ...overrides,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function makeEngine() {
  return createRuleEngine();
}

/**
 * Break shot that pockets a ball → player keeps turn, tableIsOpened becomes true.
 * Type is NOT assigned on break (C# TableIsOpened=false during break).
 */
function doBreak(engine: ReturnType<typeof createRuleEngine>, ballId = 1): void {
  engine.beginShot();
  engine.processShotResult(makeShotResult({
    contacts: [cueHits(ballId), railHit(ballId)],
    pocketed: [pocketed(ballId)],
  }));
}

/**
 * Advance engine past break and assign ball type.
 * After this: player0=Solids (if pocketedOnType is a solid 1-7), or Stripes otherwise.
 * Fires two shots: break (pocket pocketedOnBreak) → second shot (pocket pocketedOnType).
 */
function setUpType(
  engine: ReturnType<typeof createRuleEngine>,
  pocketedOnType = 3,  // solid — gives player0=Solids
): void {
  doBreak(engine, 1);          // break, pocket solid 1 → reserved, no type yet
  engine.beginShot();
  engine.processShotResult(makeShotResult({
    contacts: [cueHits(pocketedOnType), railHit(pocketedOnType)],
    pocketed: [pocketed(pocketedOnType)],
  }));
  // After: player0=Solids (if solid pocketed), player1=Stripes; turn stays with player0
}

// ─── RULE-002: ball type assignment ─────────────────────────────────────────

describe('RULE-002 — ball type assignment on first legal pocket', () => {
  it('no ball type before any pocket (table not opened)', () => {
    const engine = makeEngine();
    engine.beginShot();
    expect(engine.players[0].currentBallType).toBe(BallType.Non);
    expect(engine.tableIsOpened).toBe(false);
  });

  it('first pocketed solid (1–7) → shooter=Solids, opponent=Stripes', () => {
    const engine = makeEngine();
    doBreak(engine, 1);          // break: ball 1 reserved, no type yet
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(3), railHit(3)],
      pocketed: [pocketed(3)],   // first type-setting pocket: solid 3
    }));
    expect(verdict.ballTypeAssigned).toBe(true);
    expect(engine.players[0].currentBallType).toBe(BallType.Solids);
    expect(engine.players[1].currentBallType).toBe(BallType.Stripes);
    expect(verdict.turnChanged).toBe(false);
  });

  it('first pocketed stripe (9–15) → shooter=Stripes, opponent=Solids', () => {
    const engine = makeEngine();
    doBreak(engine, 9);          // break: stripe 9 reserved, no type yet
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(11), railHit(11)],
      pocketed: [pocketed(11)],  // first type-setting pocket: stripe 11
    }));
    expect(verdict.ballTypeAssigned).toBe(true);
    expect(engine.players[0].currentBallType).toBe(BallType.Stripes);
    expect(engine.players[1].currentBallType).toBe(BallType.Solids);
    expect(verdict.turnChanged).toBe(false);
  });

  it('reservedBalls: balls pocketed before type assigned are allocated correctly', () => {
    // Break: solid 1 pocketed (type not yet assigned → reserved). Second shot: stripe 11 pocketed → type assigned, reserved ball 1 goes to player0 (solids)
    const engine = makeEngine();
    engine.beginShot();
    // Break: pocket solid 1, no type yet (table not opened on break)
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(2), railHit(2)],
      pocketed: [pocketed(1)],
    }));
    // After break turn doesn't change (pocketed ball), table now opened
    expect(engine.tableIsOpened).toBe(true);
    expect(engine.players[0].currentBallType).toBe(BallType.Non);

    // Second shot: same player, pockets stripe 11 → type assigned
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(11), railHit(11)],
      pocketed: [pocketed(11)],
    }));
    expect(engine.players[0].currentBallType).toBe(BallType.Stripes);
    // player1 gets Solids; ball 1 was in reservedBalls → should be removed from player1's list
    expect(engine.players[1].balls.includes(1)).toBe(false);
  });

  it('ball type not re-assigned on subsequent shots', () => {
    const engine = makeEngine();
    setUpType(engine, 3);  // break + assign Solids to player0
    const typeBefore = engine.players[0].currentBallType;  // Solids

    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(5), railHit(5)],
      pocketed: [pocketed(5)],
    }));
    expect(verdict.ballTypeAssigned).toBe(false);
    expect(engine.players[0].currentBallType).toBe(typeBefore);
  });

  // R2 parity pin (鼬 completeness, challenges/017): same-step TYPE-DETERMINING tie-break.
  // Counterpart to case D's same-step FOUL tie-break. Ball type assignment is foundational
  // (it drives the whole game), so the id-order of a simultaneous solid+stripe pocket must
  // be pinned. Solid 1 and stripe 9 pocket at the SAME stepIndex: the merged event stream
  // sorts by (stepIndex, ballId) → ball 1 (id1) is processed BEFORE ball 9 (id9). The first
  // pocket sets types (shooter→Solids since ball 1 is a solid), then _hasBallType flips true
  // (rule-engine.ts:216, AFTER _updatePlayersBalls) so the same-step ball 9 takes the else
  // branch and does NOT re-flip the type. Mirrors C# UpdatePlayersBalls + OnBallInPocket:553/555
  // (UpdatePlayersBalls runs, THEN hasBallType is set). Red here would mean a same-step
  // type-determination ordering bug (same class as FAIL-1/2).
  it('same-step solid 1 + stripe 9 (same stepIndex) → shooter=Solids (id1<id9 sets type first)', () => {
    const engine = makeEngine();
    doBreak(engine, 5);   // open table, no type yet (ball 5 reserved on break)
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1, 0, 25), pocketed(9, 0, 25)],   // SAME stepIndex
    }));
    expect(verdict.ballTypeAssigned).toBe(true);
    expect(engine.players[0].currentBallType).toBe(BallType.Solids);   // shooter (id1 determined type)
    expect(engine.players[1].currentBallType).toBe(BallType.Stripes);  // opponent
    expect(verdict.turnChanged).toBe(false);                           // legal pot, turn continues
  });
});

// ─── RULE-001: wrong first contact ──────────────────────────────────────────

describe('RULE-001 — foul: wrong first contact', () => {
  it('cue hits opponent stripe when shooter is solids → foul, ballInHand', () => {
    const engine = makeEngine();
    setUpType(engine, 3);  // break + assign: player0=Solids
    // player0's turn: hits stripe 9 first (wrong ball for solids)
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(9), railHit(9)],
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouNeedToHitSolids);
  });

  it('cue hits no ball at all → foul, ballInHand (YouDoNotHitAnyBall)', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [],  // cue ball never hit another ball
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouDoNotHitAnyBall);
  });

  it('cue hits own ball first → no first-contact foul', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [],  // but didn't pocket — turn changes for that reason, not wrong-hit
    }));
    // turnChanged because no pocket and no... actually need rail hit check too
    // solid 1 hit cue → right ball. rail hit = 1. no pocket → YouDoNotPocketAnyBall, no BallInHand
    expect(verdict.reason).not.toBe(Reason.YouNeedToHitSolids);
  });
});

// ─── RULE-003: cue in pocket ─────────────────────────────────────────────────

describe('RULE-003 — foul: cue ball in pocket', () => {
  it('cue ball pocketed → turn changes, ballInHand, YouCueBallInPocket', () => {
    const engine = makeEngine();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1)],
      pocketed: [pocketed(0, 2)],  // cue ball = id 0
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouCueBallInPocket);
  });

  it('cue pocketed same shot as own ball → still foul (cue takes priority)', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1)],
      pocketed: [pocketed(1, 0, 25), pocketed(0, 2, 30)],  // own ball then cue
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouCueBallInPocket);
  });
});

// ─── RULE-004: ball out of table ─────────────────────────────────────────────

describe('RULE-004 — foul: cue ball out of table', () => {
  it('cue ball out → turn changes, ballInHand, YouCueBallIsOutOfTable', () => {
    const engine = makeEngine();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1)],
      outOfTable: [oot(0)],  // cue ball = id 0
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouCueBallIsOutOfTable);
  });

  it('non-cue ball out → turn changes (for that reason), no ballInHand for non-cue OOT', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    // Player0=Solids, hits own solid 3, solid 5 goes OOT
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(3), railHit(3)],
      outOfTable: [oot(5)],   // non-cue OOT
      pocketed: [],
    }));
    // Non-cue OOT: TurnIsChanged |= true. But no cueBallOOT → no ballInHand from this.
    // Reason from EndShot: !rightBallInPocket after right-ball hit with rail → YouDoNotPocketAnyBall
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.reason).not.toBe(Reason.YouCueBallIsOutOfTable);
  });
});

// ─── RULE-005: win/lose on black ball ────────────────────────────────────────

describe('RULE-005 — win/lose on black ball', () => {
  // Helper: advance engine to a state where player0 has only black left
  function engineReadyForBlack() {
    const engine = makeEngine();
    // Give player0 solids, remove all 1-7
    engine.beginShot();
    // Pocket solid 1 to assign type
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    // Pocket remaining 2-7 in subsequent shots
    for (const b of [2, 3, 4, 5, 6, 7]) {
      engine.beginShot();
      engine.processShotResult(makeShotResult({
        contacts: [cueHits(b), railHit(b)],
        pocketed: [pocketed(b)],
      }));
    }
    expect(engine.players[0].hasBlackBallToShot).toBe(true);
    return engine;
  }

  it('pocket black after clearing own balls → WIN', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8), railHit(8)],
      pocketed: [pocketed(8)],
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(0);  // player0
  });

  it('pocket black prematurely (own balls remain) → LOSE', () => {
    const engine = makeEngine();
    // Player0 = solids, but still has balls remaining
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    // Pocket black prematurely
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8)],
      pocketed: [pocketed(8)],
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(1);  // player1 wins (player0 loses)
  });

  it('pocket black + cue same shot → LOSE (cue foul overrides)', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8)],
      pocketed: [pocketed(8, 0, 25), pocketed(0, 1, 30)],  // black then cue
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(1);  // player0 loses
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RED GATES (P1-T03 QA, 卡卡西): one-pass collapse parity bugs vs BallPool8GameLogic.
  // These FAIL on commit efdc74d by design — they encode the C# "ought" behaviour and
  // are the acceptance gate for 鳴人's fix. They must turn GREEN once processShotResult
  // (a) merges pocketed+outOfTable into one stepIndex-ordered event stream, and
  // (b) routes game-end through the GameEnded() path (preserving reason) instead of
  // always running _turnChanged() which resets _lastReason → Non.
  // Scope of the fix is the pocketed/outOfTable merge only — contacts are NOT reordered.
  // ───────────────────────────────────────────────────────────────────────────

  // FAIL-1 — cue out-of-table must be time-interleaved with the black pocket.
  // C# BallPool8GameLogic.cs:571 OnBallOutOfTable: cueBallIsOutOfTable |= !GameIsEnded && IsCueBall.
  // The black drops FIRST (step25) → GameIsEnded=true → the later cue-out (step30) is ignored →
  // current player (0) WINS. The TS port processes ALL outOfTable before ALL pocketed
  // (rule-engine.ts:376-384), so cueBallIsOutOfTable is set before the black pocket → wrong LOSE.
  it('RED FAIL-1: black pocketed (step25) then cue out-of-table (step30) → WIN (cue-out after game-end ignored)', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8)],
      pocketed: [pocketed(8, 0, 25)],   // black drops first…
      outOfTable: [oot(0, 30)],         // …cue leaves the table afterwards
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(0);     // C# = WIN for current player
  });

  // Control (passes today, pins the agreeing direction): cue out-of-table BEFORE the black
  // pocket → cueBallIsOutOfTable set first → black drop = LOSE in BOTH C# and TS. A correct
  // fix must keep this LOSE while flipping FAIL-1 to WIN — i.e. the verdict is time-ordered.
  it('control: cue out-of-table (step20) then black pocketed (step25) → LOSE (both engines agree)', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8)],
      pocketed: [pocketed(8, 0, 25)],
      outOfTable: [oot(0, 20)],         // cue leaves first
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(1);     // current player loses
  });

  // FAIL-2 — a game-ending shot must surface the reason set in OnBallInPocket.
  // C# BallPoolGame.EndShot: if (GameEnded(out reason)) emit; else if (TurnChanged(...)).
  // On game-end C# returns changeTurnReason (= YouBlackBallInPocket) and never calls
  // TurnChanged(). TS always runs _turnChanged(), whose first line resets _lastReason=Non
  // (rule-engine.ts:244) → the black-ball reason is wiped to Non on every game-ending shot.
  it('RED FAIL-2: clean black win preserves reason YouBlackBallInPocket (not Non)', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8), railHit(8)],
      pocketed: [pocketed(8)],
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(0);
    expect(verdict.reason).toBe(Reason.YouBlackBallInPocket);  // C# GameEnded() reason; TS wipes → Non
  });

  // Same-step pocket/OOT tie-break (parity regression — pins the merged event stream).
  // When a black pocket and a cue out-of-table share the SAME stepIndex, the merged
  // pocketed+outOfTable stream sorts by (stepIndex, ballId), so cue id0 is processed
  // BEFORE black id8 → cueBallIsOutOfTable set first → black drop = LOSE. This mirrors
  // C# raising OnOutOfTable/OnBecameKinematic from a single id-ordered balls[] foreach
  // within one tick (BallPool8GameLogic.cs:571). Guards against a future change to the
  // tie-break order silently flipping this case.
  it('same-step black pocket + cue out-of-table → LOSE (id-order tie-break: cue id0 before black id8)', () => {
    const engine = engineReadyForBlack();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(8)],
      pocketed: [pocketed(8, 0, 25)],
      outOfTable: [oot(0, 25)],   // SAME stepIndex as the black pocket
    }));
    expect(verdict.gameEnded).toBe(true);
    expect(verdict.winner).toBe(1);  // current player loses
    // DIV-002 (faithful-but-odd): cue left the TABLE (not pocketed), yet the on-black
    // foul reason is YouCueBallInPocket — C# BallPool8GameLogic.cs:518-524 routes ANY
    // cue foul while on the black through this branch. Faithful port; do NOT "fix".
    expect(verdict.reason).toBe(Reason.YouCueBallInPocket);
  });
});

// ─── RULE-008: no-rail foul (after break) ───────────────────────────────────

describe('RULE-008 — no-rail foul after break', () => {
  it('after break: hit right ball but no ball hits rail → YouNo1BoardHit, ballInHand', () => {
    const engine = makeEngine();
    // Break: pocket a ball to open table
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    expect(engine.tableIsOpened).toBe(true);

    // Normal shot: hit own ball, no rail contact at all
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(2)],  // solid 2 — right ball for solids, but no rail hit
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouNo1BoardHit);
  });

  it('after break: hit right ball + ball hits rail but nothing pocketed → no ballInHand (YouDoNotPocketAnyBall)', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(2), railHit(2)],
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(false);  // not a foul, just missed pocket
    expect(verdict.reason).toBe(Reason.YouDoNotPocketAnyBall);
  });
});

// ─── Break shot (RULE-001 context: dead-branch 4-rail, faithful port) ────────

describe('Break shot — faithful port of C# dead-branch behavior', () => {
  it('break with no pocket → YouNo4BoardHit foul (C# dead-branch: hitBoardCount=0 on break)', () => {
    // C# OnBallHitBoard only counts when TableIsOpened=true.
    // On break, TableIsOpened=false → hitBoardCount always 0 → !TableIsOpened&&hitBoardCount<4
    // → always YouNo4BoardHit. Faithful port: break without pocket = foul.
    const engine = makeEngine();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(2), railHit(2)],
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.YouNo4BoardHit);
  });

  it('break with pocket → stay on table, table opens', () => {
    const engine = makeEngine();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    expect(verdict.turnChanged).toBe(false);
    expect(engine.tableIsOpened).toBe(true);
  });
});

// ─── RULE-006: turn timer ────────────────────────────────────────────────────

describe('RULE-006 — turn timer', () => {
  it('timer timeout → turn changes (BallInHand=true, reason=TimeIsEnded)', () => {
    const engine = makeEngine();
    // Assign type first
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    // Now timeout
    engine.beginShot();
    const verdict = engine.applyTimeout();
    expect(verdict.turnChanged).toBe(true);
    expect(verdict.ballInHand).toBe(true);
    expect(verdict.reason).toBe(Reason.TimeIsEnded);
  });
});

// ─── Turn change + player switch ─────────────────────────────────────────────

describe('Turn change — player switch', () => {
  it('after foul, currentPlayerIndex switches to 1', () => {
    const engine = makeEngine();
    engine.beginShot();
    const verdict = engine.processShotResult(makeShotResult({
      contacts: [cueHits(2), railHit(2)],
      pocketed: [],
    }));
    expect(verdict.turnChanged).toBe(true);
    expect(engine.currentPlayerIndex).toBe(1);
  });

  it('after successful pocket, currentPlayerIndex stays 0', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    expect(engine.currentPlayerIndex).toBe(0);
  });
});

// ─── LOC-003: reason → English message ──────────────────────────────────────

describe('LOC-003 — English reason strings', () => {
  it('getReasonMessage returns English string for known reasons', () => {
    const engine = makeEngine();
    expect(engine.getReasonMessage(Reason.YouCueBallInPocket)).toBe('You pocketed the cue ball');
    expect(engine.getReasonMessage(Reason.YouNeedToHitSolids)).toBe('The cue ball should hit a solid ball');
    expect(engine.getReasonMessage(Reason.YouBlackBallInPocket)).toBe('You pocketed the black ball');
    expect(engine.getReasonMessage(Reason.YouNo4BoardHit)).toBe('Very weak shot');
    expect(engine.getReasonMessage(Reason.YouNo1BoardHit)).toBe("Not one ball hasn't hit board");
    expect(engine.getReasonMessage(Reason.YouAreWinner)).toBe('You won');
    expect(engine.getReasonMessage(Reason.OpponentIsWinner)).toBe('Your opponent won');
    expect(engine.getReasonMessage(Reason.Non)).toBe('');
  });
});

// ─── RULE-007: serialize / deserialize roundtrip ────────────────────────────

describe('RULE-007 — GameLogicStateV1 roundtrip', () => {
  it('serialize → deserialize restores all rule engine state', () => {
    const engine = makeEngine();
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(1), railHit(1)],
      pocketed: [pocketed(1)],
    }));
    engine.beginShot();
    engine.processShotResult(makeShotResult({
      contacts: [cueHits(3), railHit(3)],
      pocketed: [pocketed(3)],
    }));

    const snapshot = engine.serialize();

    const engine2 = makeEngine();
    engine2.deserialize(snapshot);

    expect(engine2.currentPlayerIndex).toBe(engine.currentPlayerIndex);
    expect(engine2.tableIsOpened).toBe(engine.tableIsOpened);
    expect(engine2.players[0].currentBallType).toBe(engine.players[0].currentBallType);
    expect(engine2.players[1].currentBallType).toBe(engine.players[1].currentBallType);
    expect(engine2.players[0].balls).toEqual(engine.players[0].balls);
    expect(engine2.players[1].balls).toEqual(engine.players[1].balls);
  });
});
