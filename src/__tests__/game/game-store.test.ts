/**
 * GAME-001 — game-store FSM transition tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGameStore } from '../../game/game-store';
import type { ShotVerdict } from '../../game/rule-engine';
import { Reason } from '../../game/game-play-reason';

function makeVerdict(overrides: Partial<ShotVerdict> = {}): ShotVerdict {
  return {
    gameEnded: false,
    winner: null,
    turnChanged: false,
    ballInHand: false,
    reason: Reason.Non,
    ballTypeAssigned: false,
    ...overrides,
  };
}

describe('game-store FSM — GAME-001', () => {
  it('starts in MainMenu', () => {
    const store = createGameStore();
    expect(store.getState().phase).toBe('MainMenu');
    expect(store.getState().currentPlayerIndex).toBe(0);
    expect(store.getState().winner).toBeNull();
  });

  // ── START_GAME ──────────────────────────────────────────────────────────────

  it('START_GAME transitions MainMenu → Aiming', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    expect(store.getState().phase).toBe('Aiming');
    expect(store.getState().currentPlayerIndex).toBe(0);
  });

  it('START_GAME is ignored outside MainMenu', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    const before = store.getState();
    store.dispatch({ type: 'START_GAME' });
    expect(store.getState()).toBe(before);  // no change
  });

  // ── SHOT_FIRED ──────────────────────────────────────────────────────────────

  it('SHOT_FIRED transitions Aiming → InShot', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    expect(store.getState().phase).toBe('InShot');
  });

  it('SHOT_FIRED is ignored outside Aiming', () => {
    const store = createGameStore();
    store.dispatch({ type: 'SHOT_FIRED' });
    expect(store.getState().phase).toBe('MainMenu');
  });

  // ── REPLAY_DONE normal (same player keeps turn) ─────────────────────────────

  it('REPLAY_DONE(turnChanged=false, no foul) → Aiming same player', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({ turnChanged: false }),
      reasonMessage: '',
    });
    expect(store.getState().phase).toBe('Aiming');
    expect(store.getState().currentPlayerIndex).toBe(0);
  });

  // ── REPLAY_DONE turn change ─────────────────────────────────────────────────

  it('REPLAY_DONE(turnChanged=true) → Aiming next player', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({ turnChanged: true }),
      reasonMessage: 'Missed',
    });
    expect(store.getState().phase).toBe('Aiming');
    expect(store.getState().currentPlayerIndex).toBe(1);
    expect(store.getState().reasonMessage).toBe('Missed');
  });

  // ── REPLAY_DONE ball-in-hand ────────────────────────────────────────────────

  it('REPLAY_DONE(ballInHand=true, turnChanged=true) → BallInHand next player', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({ ballInHand: true, turnChanged: true }),
      reasonMessage: 'Foul',
    });
    expect(store.getState().phase).toBe('BallInHand');
    expect(store.getState().currentPlayerIndex).toBe(1);
  });

  // ── BALL_PLACED ─────────────────────────────────────────────────────────────

  it('BALL_PLACED transitions BallInHand → Aiming', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({ ballInHand: true, turnChanged: true }),
      reasonMessage: '',
    });
    expect(store.getState().phase).toBe('BallInHand');
    store.dispatch({ type: 'BALL_PLACED' });
    expect(store.getState().phase).toBe('Aiming');
  });

  it('BALL_PLACED is ignored outside BallInHand', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    const before = store.getState();
    store.dispatch({ type: 'BALL_PLACED' });
    expect(store.getState()).toBe(before);
  });

  // ── REPLAY_DONE game-over ───────────────────────────────────────────────────

  it('REPLAY_DONE(gameEnded=true) → GameOver with winner', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({
        gameEnded: true,
        winner: 0,
        reason: Reason.YouBlackBallInPocket,
      }),
      reasonMessage: 'You pocketed the black ball',
    });
    const s = store.getState();
    expect(s.phase).toBe('GameOver');
    expect(s.winner).toBe(0);
    expect(s.lastReason).toBe(Reason.YouBlackBallInPocket);
    expect(s.reasonMessage).toBe('You pocketed the black ball');
  });

  // ── PLAY_AGAIN / EXIT_GAME ──────────────────────────────────────────────────

  it('PLAY_AGAIN transitions GameOver → Aiming (player 0)', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({
      type: 'REPLAY_DONE',
      verdict: makeVerdict({ gameEnded: true, winner: 1 }),
      reasonMessage: '',
    });
    store.dispatch({ type: 'PLAY_AGAIN' });
    const s = store.getState();
    expect(s.phase).toBe('Aiming');
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.winner).toBeNull();
  });

  it('EXIT_GAME always resets to MainMenu', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({ type: 'EXIT_GAME' });
    expect(store.getState().phase).toBe('MainMenu');
  });

  // ── Subscribe ───────────────────────────────────────────────────────────────

  it('subscribe fires on state change', () => {
    const store = createGameStore();
    const fn = vi.fn();
    store.subscribe(fn);
    store.dispatch({ type: 'START_GAME' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('subscribe does not fire when state is unchanged (guard)', () => {
    const store = createGameStore();
    const fn = vi.fn();
    store.subscribe(fn);
    // SHOT_FIRED outside Aiming → no-op
    store.dispatch({ type: 'SHOT_FIRED' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const store = createGameStore();
    const fn = vi.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.dispatch({ type: 'START_GAME' });
    expect(fn).not.toHaveBeenCalled();
  });

  // ── currentPlayerIndex tracking ─────────────────────────────────────────────

  it('tracks currentPlayerIndex across multiple turns', () => {
    const store = createGameStore();
    store.dispatch({ type: 'START_GAME' });
    expect(store.getState().currentPlayerIndex).toBe(0);

    // Shot 1: player 0 misses, turn changes to player 1
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({ type: 'REPLAY_DONE', verdict: makeVerdict({ turnChanged: true }), reasonMessage: '' });
    expect(store.getState().currentPlayerIndex).toBe(1);

    // Shot 2: player 1 misses, turn changes to player 0
    store.dispatch({ type: 'SHOT_FIRED' });
    store.dispatch({ type: 'REPLAY_DONE', verdict: makeVerdict({ turnChanged: true }), reasonMessage: '' });
    expect(store.getState().currentPlayerIndex).toBe(0);
  });
});
