/**
 * GAME-001 — game-state FSM store.
 * Pure state machine: no side-effects, no DOM. Subscribers handle side-effects.
 *
 * C# equivalent: GameManager.GameState (static enum) + BallPool8GameManager event delegates.
 * Web: single reactive store replacing the static global.
 */

import type { ReasonValue } from './game-play-reason';
import type { ShotVerdict } from './rule-engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'MainMenu'    // before game starts / after exit
  | 'Aiming'      // current player is aiming
  | 'InShot'      // replay in progress after applyShot
  | 'BallInHand'  // CUE-013/G5: player must place cue ball
  | 'GameOver';   // game ended (winner / draw)

export interface GameState {
  readonly phase: GamePhase;
  readonly currentPlayerIndex: 0 | 1;
  readonly lastVerdict: ShotVerdict | null;
  readonly winner: 0 | 1 | null;
  readonly lastReason: ReasonValue;
  readonly reasonMessage: string;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'SHOT_FIRED' }
  | { type: 'REPLAY_DONE'; verdict: ShotVerdict; reasonMessage: string }
  | { type: 'BALL_PLACED' }
  | { type: 'EXIT_GAME' }
  | { type: 'PLAY_AGAIN' };

export interface GameStore {
  getState(): Readonly<GameState>;
  dispatch(action: GameAction): void;
  subscribe(fn: () => void): () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const INITIAL_STATE: GameState = {
  phase: 'MainMenu',
  currentPlayerIndex: 0,
  lastVerdict: null,
  winner: null,
  lastReason: 0,
  reasonMessage: '',
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function nextPlayer(idx: 0 | 1): 0 | 1 {
  return idx === 0 ? 1 : 0;
}

function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case 'START_GAME':
      if (state.phase !== 'MainMenu') return state;
      return { ...INITIAL_STATE, phase: 'Aiming', currentPlayerIndex: 0 };

    case 'SHOT_FIRED':
      if (state.phase !== 'Aiming') return state;
      return { ...state, phase: 'InShot' };

    case 'REPLAY_DONE': {
      if (state.phase !== 'InShot') return state;
      const { verdict, reasonMessage } = action;
      const nextIdx = verdict.turnChanged
        ? nextPlayer(state.currentPlayerIndex)
        : state.currentPlayerIndex;

      if (verdict.gameEnded) {
        return {
          ...state,
          phase: 'GameOver',
          lastVerdict: verdict,
          winner: verdict.winner,
          lastReason: verdict.reason,
          reasonMessage,
        };
      }
      if (verdict.ballInHand) {
        return {
          ...state,
          phase: 'BallInHand',
          lastVerdict: verdict,
          currentPlayerIndex: nextIdx,
          lastReason: verdict.reason,
          reasonMessage,
        };
      }
      return {
        ...state,
        phase: 'Aiming',
        lastVerdict: verdict,
        currentPlayerIndex: nextIdx,
        lastReason: verdict.reason,
        reasonMessage,
      };
    }

    case 'BALL_PLACED':
      if (state.phase !== 'BallInHand') return state;
      return { ...state, phase: 'Aiming' };

    case 'EXIT_GAME':
      return { ...INITIAL_STATE };

    case 'PLAY_AGAIN':
      if (state.phase !== 'GameOver') return state;
      return { ...INITIAL_STATE, phase: 'Aiming', currentPlayerIndex: 0 };

    default:
      return state;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createGameStore(): GameStore {
  let state: GameState = { ...INITIAL_STATE };
  const listeners = new Set<() => void>();

  return {
    getState(): Readonly<GameState> { return state; },

    dispatch(action: GameAction): void {
      const next = reduce(state, action);
      if (next !== state) {
        state = next;
        for (const fn of listeners) fn();
      }
    },

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
