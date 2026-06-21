/**
 * 8-Ball rule engine — faithful port of C# BallPool8GameLogic.
 *
 * Core mapping:
 *   beginShot()          ← Shot() [reset per-shot state]
 *   processShotResult()  ← OnBallHitBall/OnBallHitBoard/OnBallInPocket/
 *                          OnBallOutOfTable/EndShot/TurnChanged/GameEnded (merged)
 *   applyTimeout()       ← OnTimeEnded path in Update()
 *
 * RULE-007 via serialize()/deserialize().
 * LOC-003 via getReasonMessage() (English baseline).
 */

import { createPlayerBallInfo, BallType } from './player-ball-info';
import type { PlayerBallInfo } from './player-ball-info';
import { Reason, REASON_MESSAGES } from './game-play-reason';
import type { ReasonValue } from './game-play-reason';
import type { ShotResult } from './ball-pool-physics';

export interface ShotVerdict {
  readonly gameEnded: boolean;
  readonly winner: 0 | 1 | null;     // player index; null if game not ended
  readonly turnChanged: boolean;
  readonly ballInHand: boolean;
  readonly reason: ReasonValue;
  readonly ballTypeAssigned: boolean; // true if ball type was set this shot
}

export interface GameLogicStateV1 {
  readonly version: 1;
  readonly isFirstShot: boolean;
  readonly tableIsOpened: boolean;
  readonly turnIsChanged: boolean;
  readonly currentPlayerIndex: 0 | 1;
  readonly hasBallType: boolean;
  readonly setBallTypeFlag: boolean;
  readonly pocketedBalls: ReadonlyArray<{ ballId: number; pocketId: number }>;
  readonly reservedBalls: readonly number[];
  readonly players: readonly [PlayerBall8StateV1, PlayerBall8StateV1];
  readonly lastReason: ReasonValue;
  readonly gameIsEnded: boolean;
  readonly isWinner: boolean;
  readonly shotStartedAt: number;  // Unix ms; wall-clock only — never enters physics hash
}

interface PlayerBall8StateV1 {
  readonly ballType: BallType;
  readonly ballInHand: boolean;
  readonly balls: readonly number[];
}

export interface RuleEngine {
  // ── current observable state ──────────────────────────────────────────────
  readonly currentPlayerIndex: 0 | 1;
  readonly players: readonly [PlayerBallInfo, PlayerBallInfo];
  readonly gameIsEnded: boolean;
  readonly isFirstShot: boolean;
  readonly tableIsOpened: boolean;

  // ── per-shot lifecycle ────────────────────────────────────────────────────
  /** Reset per-shot counters. Call before applyShot(). C# Shot(). */
  beginShot(): void;

  /**
   * Evaluate one shot's result and return the rule verdict.
   * Processes ShotResult in stepIndex order (contacts and pocketed are already
   * time-ordered per G6 §2.1 / §5 pocketed note).
   */
  processShotResult(result: ShotResult): ShotVerdict;

  /** Timeout foul — replaces shot when timer fires. C# OnTimeEnded(). */
  applyTimeout(): ShotVerdict;

  // ── RULE-007 ──────────────────────────────────────────────────────────────
  serialize(): GameLogicStateV1;
  deserialize(state: GameLogicStateV1): void;

  // ── LOC-003 ──────────────────────────────────────────────────────────────
  getReasonMessage(reason: ReasonValue): string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCueBall(id: number)   { return id === 0; }
function isBlackBall(id: number) { return id === 8; }
function isSolidBall(id: number) { return id >= 1 && id <= 7; }
function isStripeBall(id: number){ return id >= 9; }

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createRuleEngine(): RuleEngine {
  // ── Persistent game state (between shots) ──────────────────────────────
  let _currentPlayerIndex: 0 | 1 = 0;
  const _players = [createPlayerBallInfo(), createPlayerBallInfo()];
  let _gameIsEnded = false;
  let _isFirstShot = true;
  let _tableIsOpened = false;
  let _hasBallType = false;
  let _setBallTypeFlag = false;
  let _isWinner = false;
  let _lastReason: ReasonValue = Reason.Non;
  // pocketed balls tracking (for UI / serialization)
  const _pocketedBalls: Array<{ ballId: number; pocketId: number }> = [];
  const _reservedBalls: number[] = [];      // pocketed before type was set
  let _playerBallInHand: [boolean, boolean] = [false, false];

  // ── Per-shot state (reset in beginShot) ────────────────────────────────
  let _hitRightTargetBall = false;
  let _rightBallInPocket = false;
  let _hitBoardCount = 0;
  let _cueBallInPocket = false;
  let _cueBallIsOutOfTable = false;
  let _blackBallInPocket = false;
  let _turnIsChanged = false;
  let _shotBallInHand = false;             // BallInHand for THIS shot's verdict
  let _ballTypeAssigned = false;

  function _nextPlayerIndex(): 0 | 1 { return _currentPlayerIndex === 0 ? 1 : 0; }
  function _curPlayer() { return _players[_currentPlayerIndex]; }
  function _nextPlayer() { return _players[_nextPlayerIndex()]; }

  // C# RessetPlayersGameInfo() — zero winner/ballInHand for all
  function _resetPlayersGameInfo(): void {
    _playerBallInHand = [false, false];
  }

  // C# IsAllowableBalls()
  function _isAllowableBall(ballId: number): boolean {
    if (isCueBall(ballId)) return false;
    if (isBlackBall(ballId)) return _curPlayer().hasBlackBallToShot;
    if (_curPlayer().hasBlackBallToShot) return false;
    return _curPlayer().currentBallType === BallType.Non ||
           _curPlayer().isSameBallType(ballId);
  }

  // C# UpdatePlayersBalls() — assign balls to players when type is determined
  function _updatePlayersBalls(ballId: number): void {
    if (isCueBall(ballId)) return;
    const isBlack = isBlackBall(ballId);

    if (!_tableIsOpened) {
      // Break: before type set → reserve non-black balls
      if (!isBlack) _reservedBalls.push(ballId);
      return;
    }

    for (let idx = 0; idx < 2; idx++) {
      const player = _players[idx];
      const isSameAsCurrentIdx = idx === _currentPlayerIndex;

      if (isBlack) {
        if (player.hasBlackBallToShot) player.resetBalls();
        continue;
      }

      if (!_hasBallType) {
        // First type-determining pocket: assign stripes/solids by pocketed ball type
        if (isStripeBall(ballId) === isSameAsCurrentIdx) {
          player.setStripes();
        } else {
          player.setSolids();
        }
        if (isSameAsCurrentIdx) {
          player.removeBall(ballId);
        }
        // Apply reserved balls accumulated before type was set
        for (const rId of _reservedBalls) {
          if (player.isSameBallType(rId)) player.removeBall(rId);
        }
      } else {
        if (player.isSameBallType(ballId)) player.removeBall(ballId);
      }
    }
  }

  // C# OnBallInPocket() — pockets evaluated in ShotResult.pocketed[] order (time order)
  function _processPocket(ballId: number, pocketId: number): void {
    if (!isCueBall(ballId)) {
      _pocketedBalls.push({ ballId, pocketId });
    }

    _cueBallInPocket ||= isCueBall(ballId);
    _blackBallInPocket ||= isBlackBall(ballId);

    // If black + (cue || cuePocketed || not yet clear) → game over, current player LOSES
    _gameIsEnded ||= _blackBallInPocket &&
                     (_cueBallIsOutOfTable || _cueBallInPocket || !_curPlayer().hasBlackBallToShot);

    if (_gameIsEnded) {
      if (!_curPlayer().hasBlackBallToShot) {
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouBlackBallInPocket : Reason.OpponentBlackBallInPocket;
      } else {
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouCueBallInPocket : Reason.OpponentCueBallInPocket;
      }
      _isWinner = false;
      _updatePlayersBalls(ballId);
      return;
    }

    // Black without foul → WIN
    _gameIsEnded ||= _blackBallInPocket;
    if (_gameIsEnded) {
      _lastReason = _currentPlayerIndex === 0
        ? Reason.YouBlackBallInPocket : Reason.OpponentBlackBallInPocket;
      _isWinner = true;
      _rightBallInPocket = true;
      _updatePlayersBalls(ballId);
      return;
    }

    _rightBallInPocket ||= _isAllowableBall(ballId);
    _updatePlayersBalls(ballId);

    _hasBallType ||= _tableIsOpened && !isCueBall(ballId);
    if (!_setBallTypeFlag && _hasBallType) {
      _setBallTypeFlag = true;
      _ballTypeAssigned = true;
    }
  }

  // C# SetWinner()
  function _setWinner(): void {
    // winner set on player whose _isWinner flag matches currentPlayer
    // actual winner info lives in _isWinner + _currentPlayerIndex
  }

  // C# EndShot() — finalise turnIsChanged
  function _endShot(): void {
    if (_gameIsEnded) {
      _setWinner();
      _turnIsChanged = false;
      return;
    }
    for (const p of _players) p.checkBlackBallToShot();

    _turnIsChanged ||= !_gameIsEnded &&
      (_cueBallIsOutOfTable || _cueBallInPocket || !_hitRightTargetBall || !_rightBallInPocket);
  }

  // C# TurnChanged() — determine reason + BallInHand + switch player
  function _turnChanged(): ShotVerdict {
    _lastReason = Reason.Non;

    if (_turnIsChanged) {
      if (_cueBallIsOutOfTable) {
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouCueBallIsOutOfTable : Reason.OpponentCueBallIsOutOfTable;
        _shotBallInHand = true;
      } else if (_cueBallInPocket) {
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouCueBallInPocket : Reason.OpponentCueBallInPocket;
        _shotBallInHand = true;
      } else if (!_tableIsOpened && _hitBoardCount < 4) {
        // Faithful port of C# dead-branch: hitBoardCount is NEVER counted during break
        // (OnBallHitBoard guards with TableIsOpened). Break without pocket = always this foul.
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouNo4BoardHit : Reason.OpponentNo4BoardHit;
        _shotBallInHand = true;
      } else if (!_hitRightTargetBall) {
        if (_curPlayer().hasBlackBallToShot) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToHitBlack : Reason.OpponentNeedToHitBlack;
        } else if (_curPlayer().currentBallType === BallType.Solids) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToHitSolids : Reason.OpponentNeedToHitSolids;
        } else if (_curPlayer().currentBallType === BallType.Stripes) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToHitStripes : Reason.OpponentNeedToHitStripes;
        } else {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouDoNotHitAnyBall : Reason.OpponentDoNotHitAnyBall;
        }
        _shotBallInHand = true;
      } else if (_hitBoardCount < 1) {
        // Active check: after break, right ball was hit but no non-cue ball hit a rail → foul
        _lastReason = _currentPlayerIndex === 0
          ? Reason.YouNo1BoardHit : Reason.OpponentNo1BoardHit;
        _shotBallInHand = true;
      } else if (!_rightBallInPocket) {
        if (_curPlayer().hasBlackBallToShot) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToPocketBlack : Reason.OpponentNeedToPocketBlack;
        } else if (_curPlayer().currentBallType === BallType.Solids) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToPocketSolids : Reason.OpponentNeedToPocketSolids;
        } else if (_curPlayer().currentBallType === BallType.Stripes) {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouNeedToPocketStripes : Reason.OpponentNeedToPocketStripes;
        } else {
          _lastReason = _currentPlayerIndex === 0
            ? Reason.YouDoNotPocketAnyBall : Reason.OpponentDoNotPocketAnyBall;
        }
        _shotBallInHand = false;  // not a foul, no ball-in-hand
      }

      _currentPlayerIndex = _nextPlayerIndex();
      _resetPlayersGameInfo();
      _playerBallInHand[_currentPlayerIndex] = _shotBallInHand;
    }

    _tableIsOpened = true;

    // Determine winner index for GameEnded path
    let winner: 0 | 1 | null = null;
    if (_gameIsEnded) {
      winner = _isWinner ? _currentPlayerIndex : _nextPlayerIndex();
    }

    return {
      gameEnded: _gameIsEnded,
      winner,
      turnChanged: _turnIsChanged,
      ballInHand: _shotBallInHand,
      reason: _lastReason,
      ballTypeAssigned: _ballTypeAssigned,
    };
  }

  return {
    get currentPlayerIndex() { return _currentPlayerIndex; },
    get players(): readonly [PlayerBallInfo, PlayerBallInfo] {
      return [_players[0], _players[1]];
    },
    get gameIsEnded() { return _gameIsEnded; },
    get isFirstShot() { return _isFirstShot; },
    get tableIsOpened() { return _tableIsOpened; },

    // ── C# Shot() ──────────────────────────────────────────────────────────
    beginShot(): void {
      // C#: TableIsOpened |= !isFirstShot (stays false on break, true after)
      _tableIsOpened ||= !_isFirstShot;
      _isFirstShot = false;
      _turnIsChanged = false;
      _hitRightTargetBall = false;
      _rightBallInPocket = false;
      _hitBoardCount = 0;
      _cueBallInPocket = false;
      _cueBallIsOutOfTable = false;
      _blackBallInPocket = false;
      _isWinner = false;
      _shotBallInHand = false;
      _ballTypeAssigned = false;
      _lastReason = Reason.Non;
      _resetPlayersGameInfo();
    },

    // ── Main judge ─────────────────────────────────────────────────────────
    processShotResult(result: ShotResult): ShotVerdict {
      // ── S4: cue first contact (C# OnBallHitBall / isFirstHit) ─────────
      // pocketed[] and contacts[] are in stepIndex order (time order) per G6.
      // Merge them to find the true first event by stepIndex.
      const firstCueBallContact = result.contacts.find(
        c => c.kind === 'ball' && (c.ballId === 0 || c.otherBallId === 0)
      );
      if (firstCueBallContact) {
        const otherId = firstCueBallContact.ballId === 0
          ? firstCueBallContact.otherBallId!
          : firstCueBallContact.ballId;
        _hitRightTargetBall = _isAllowableBall(otherId);
      }

      // ── Cushion hits (C# OnBallHitBoard): only counted when TableIsOpened ─
      // hitBoardCount counts non-cue ball onset cushion contacts.
      // On break, _tableIsOpened=false so this stays 0 (C# dead-branch faithful port).
      if (_tableIsOpened) {
        for (const c of result.contacts) {
          if (c.kind === 'cushion' && !isCueBall(c.ballId)) {
            _hitBoardCount++;
          }
        }
      }

      // ── Ball out of table (C# OnBallOutOfTable) ────────────────────────
      for (const oot of result.outOfTable) {
        _turnIsChanged ||= !_gameIsEnded;
        _cueBallIsOutOfTable ||= !_gameIsEnded && isCueBall(oot.ballId);
      }

      // ── Pocketed balls in time order (C# OnBallInPocket) ──────────────
      for (const p of result.pocketed) {
        _processPocket(p.ballId, p.pocketId);
      }

      // ── EndShot + TurnChanged ──────────────────────────────────────────
      _endShot();
      return _turnChanged();
    },

    // ── C# OnTimeEnded() path ──────────────────────────────────────────────
    applyTimeout(): ShotVerdict {
      _turnIsChanged = true;
      _tableIsOpened = true;
      _shotBallInHand = true;
      _lastReason = Reason.TimeIsEnded;

      _currentPlayerIndex = _nextPlayerIndex();
      _resetPlayersGameInfo();
      _playerBallInHand[_currentPlayerIndex] = true;

      return {
        gameEnded: false,
        winner: null,
        turnChanged: true,
        ballInHand: true,
        reason: Reason.TimeIsEnded,
        ballTypeAssigned: false,
      };
    },

    // ── RULE-007 ───────────────────────────────────────────────────────────
    serialize(): GameLogicStateV1 {
      return {
        version: 1,
        isFirstShot: _isFirstShot,
        tableIsOpened: _tableIsOpened,
        turnIsChanged: _turnIsChanged,
        currentPlayerIndex: _currentPlayerIndex,
        hasBallType: _hasBallType,
        setBallTypeFlag: _setBallTypeFlag,
        pocketedBalls: [..._pocketedBalls],
        reservedBalls: [..._reservedBalls],
        players: [
          {
            ballType: _players[0].currentBallType,
            ballInHand: _playerBallInHand[0],
            balls: [..._players[0].balls],
          },
          {
            ballType: _players[1].currentBallType,
            ballInHand: _playerBallInHand[1],
            balls: [..._players[1].balls],
          },
        ],
        lastReason: _lastReason,
        gameIsEnded: _gameIsEnded,
        isWinner: _isWinner,
        shotStartedAt: Date.now(),
      };
    },

    deserialize(state: GameLogicStateV1): void {
      _isFirstShot     = state.isFirstShot;
      _tableIsOpened   = state.tableIsOpened;
      _turnIsChanged   = state.turnIsChanged;
      _currentPlayerIndex = state.currentPlayerIndex as 0 | 1;
      _hasBallType     = state.hasBallType;
      _setBallTypeFlag = state.setBallTypeFlag;
      _pocketedBalls.length = 0;
      _pocketedBalls.push(...state.pocketedBalls);
      _reservedBalls.length = 0;
      _reservedBalls.push(...state.reservedBalls);
      _lastReason   = state.lastReason;
      _gameIsEnded  = state.gameIsEnded;
      _isWinner     = state.isWinner;

      for (let i = 0; i < 2; i++) {
        const ps = state.players[i];
        _players[i].applyRawState(ps.ballType, [...ps.balls]);
        _players[i].checkBlackBallToShot();
        _playerBallInHand[i] = ps.ballInHand;
      }
    },

    // ── LOC-003 ───────────────────────────────────────────────────────────
    getReasonMessage(reason: ReasonValue): string {
      return REASON_MESSAGES[reason] ?? '';
    },
  };
}
