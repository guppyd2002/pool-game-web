/**
 * Single-source reason codes mirroring C# BallPool8GamePlayInfo + GamePlayInfo.
 * GamePlayInfo.Last = 100; BallPool8 codes start at 101.
 * LOC-003: English message strings are in REASON_MESSAGES below.
 */

export const Reason = {
  Non:                      0,
  TimeIsEnded:              1,
  YouAreWinner:             2,
  OpponentIsWinner:         3,
  Draw:                     4,
  YourTurn:                 5,
  YourOpponentTurn:         6,

  // BallPool8-specific (Last=100)
  YouCueBallInPocket:       101,
  OpponentCueBallInPocket:  102,
  YouCueBallIsOutOfTable:   103,
  OpponentCueBallIsOutOfTable: 104,
  YouNeedToHitSolids:       105,
  YouNeedToHitStripes:      106,
  OpponentNeedToHitSolids:  107,
  OpponentNeedToHitStripes: 108,
  YouNeedToHitBlack:        109,
  OpponentNeedToHitBlack:   110,
  YouNo4BoardHit:           111,  // "Very weak shot" — faithful port of C# dead-branch (break foul)
  OpponentNo4BoardHit:      112,
  YouNeedToPocketSolids:    113,
  YouNeedToPocketStripes:   114,
  OpponentNeedToPocketSolids:  115,
  OpponentNeedToPocketStripes: 116,
  YouNeedToPocketBlack:     117,
  OpponentNeedToPocketBlack:   118,
  YouDoNotHitAnyBall:       119,
  OpponentDoNotHitAnyBall:  120,
  YouDoNotPocketAnyBall:    121,
  OpponentDoNotPocketAnyBall:  122,
  YouAreSolids:             123,
  YouAreStripes:            124,
  YouBallInHand:            125,
  OpponentBallInHand:       126,
  YouBlackBallInPocket:     127,
  OpponentBlackBallInPocket:   128,
  YouNo1BoardHit:           129,
  OpponentNo1BoardHit:      130,
  OpponentLeftGame:         131,
} as const;

export type ReasonValue = typeof Reason[keyof typeof Reason];

/** LOC-003: English baseline strings. Multilingual DEFERRED P3. */
export const REASON_MESSAGES: Readonly<Record<number, string>> = {
  [Reason.Non]:                      '',
  [Reason.TimeIsEnded]:              'Time is over',
  [Reason.YouAreWinner]:             'You won',
  [Reason.OpponentIsWinner]:         'Your opponent won',
  [Reason.Draw]:                     "Nobody won, it's a draw",
  [Reason.YourTurn]:                 'Your turn',
  [Reason.YourOpponentTurn]:         "Opponent's turn",
  [Reason.YouCueBallInPocket]:       'You pocketed the cue ball',
  [Reason.OpponentCueBallInPocket]:  'Your opponent pocketed the cue ball',
  [Reason.YouCueBallIsOutOfTable]:   'The cue ball jumped out of the table',
  [Reason.OpponentCueBallIsOutOfTable]: 'The cue ball jumped out of the table',
  [Reason.YouNeedToHitSolids]:       'The cue ball should hit a solid ball',
  [Reason.YouNeedToHitStripes]:      'The cue ball should hit a stripes ball',
  [Reason.OpponentNeedToHitSolids]:  'The cue ball should hit a solid ball',
  [Reason.OpponentNeedToHitStripes]: 'The cue ball should hit a stripes ball',
  [Reason.YouNeedToHitBlack]:        'The cue ball should hit the black ball',
  [Reason.OpponentNeedToHitBlack]:   'The cue ball should hit the black ball',
  [Reason.YouNo4BoardHit]:           'Very weak shot',         // C# dead-branch faithful port
  [Reason.OpponentNo4BoardHit]:      'Very weak shot',
  [Reason.YouNeedToPocketSolids]:    'You have to pocket solids ball',
  [Reason.YouNeedToPocketStripes]:   'You have to pocket stripes ball',
  [Reason.OpponentNeedToPocketSolids]:  'Your opponent have to pocket a solid ball',
  [Reason.OpponentNeedToPocketStripes]: 'Your opponent have to pocket a stripe ball',
  [Reason.YouNeedToPocketBlack]:     'You have to pocket the black ball',
  [Reason.OpponentNeedToPocketBlack]:   'Your opponent have to pocket the black ball',
  [Reason.YouDoNotHitAnyBall]:       "The cue ball didn't hit any ball",
  [Reason.OpponentDoNotHitAnyBall]:  "The cue ball didn't hit any ball",
  [Reason.YouDoNotPocketAnyBall]:    'You have to pocket any ball',
  [Reason.OpponentDoNotPocketAnyBall]:  'Your opponent have to pocket any ball',
  [Reason.YouAreSolids]:             'You play solids',
  [Reason.YouAreStripes]:            'You play stripes',
  [Reason.YouBallInHand]:            'You have cue ball in hand',
  [Reason.OpponentBallInHand]:       'Your opponent has cue ball in hand',
  [Reason.YouBlackBallInPocket]:     'You pocketed the black ball',
  [Reason.OpponentBlackBallInPocket]:   'Your opponent pocketed the black ball',
  [Reason.YouNo1BoardHit]:           "Not one ball hasn't hit board",
  [Reason.OpponentNo1BoardHit]:      "Not one ball hasn't hit board",
  [Reason.OpponentLeftGame]:         'Your opponent left game',
};
