/**
 * Per-player ball tracking — faithful port of C# PlayerBallPool8GameInfo.
 * Tracks which balls each player still needs to pocket, and when they
 * transition to "only black ball left".
 */

export enum BallType { Non = 0, Stripes = 1, Solids = 2 }

export interface PlayerBallInfo {
  readonly currentBallType: BallType;
  readonly hasBlackBallToShot: boolean;
  readonly balls: readonly number[];  // 7 slots; 0=cleared; 8=black
  isSameBallType(ballId: number): boolean;
  setStripes(): void;
  setSolids(): void;
  resetBalls(): void;
  removeBall(ballId: number): void;
  checkBlackBallToShot(): void;
  /** Load raw state (for RULE-007 deserialization). Does NOT call checkBlackBallToShot. */
  applyRawState(ballType: BallType, balls: number[]): void;
}

export function createPlayerBallInfo(): PlayerBallInfo {
  let _ballType = BallType.Non;
  let _hasBlack = false;
  const _balls: number[] = [0, 0, 0, 0, 0, 0, 0];

  // C# SetBlackBall(): stripes → [8,0,0,0,0,0,0]; solids → [0,0,0,0,0,0,8]
  function _setBlackBall(): void {
    _balls.fill(0);
    if (_ballType === BallType.Stripes) _balls[0] = 8;
    else _balls[6] = 8;
  }

  return {
    get currentBallType() { return _ballType; },
    get hasBlackBallToShot() { return _hasBlack; },
    get balls(): readonly number[] { return _balls; },

    isSameBallType(ballId: number): boolean {
      return (_ballType === BallType.Solids && ballId >= 1 && ballId <= 7) ||
             (_ballType === BallType.Stripes && ballId >= 9);
    },

    setStripes(): void {
      _ballType = BallType.Stripes;
      for (let i = 0; i < 7; i++) _balls[i] = 9 + i;
    },

    setSolids(): void {
      _ballType = BallType.Solids;
      for (let i = 0; i < 7; i++) _balls[i] = 1 + i;
    },

    resetBalls(): void {
      _balls.fill(0);
    },

    // C# RemoveBall(): zero the slot; if all zero → SetBlackBall()
    removeBall(ballId: number): void {
      let allIsZero = true;
      for (let i = 0; i < _balls.length; i++) {
        if (_balls[i] === ballId) _balls[i] = 0;
        else allIsZero = allIsZero && _balls[i] === 0;
      }
      if (allIsZero) _setBlackBall();
    },

    // C# CheckBlackBallToShot(): Balls[0]==8 || Balls[6]==8
    checkBlackBallToShot(): void {
      _hasBlack = _balls[0] === 8 || _balls[6] === 8;
    },

    applyRawState(ballType: BallType, balls: number[]): void {
      _ballType = ballType;
      for (let i = 0; i < 7; i++) _balls[i] = balls[i] ?? 0;
    },
  };
}
