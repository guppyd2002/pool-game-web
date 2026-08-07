/**
 * P1-T09 mid-game save TTL (DATA-001).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createGameSaveManager,
  GAME_SAVE_LS_KEY,
} from '../../game/game-save-manager';
import type { GameLogicStateV1 } from '../../game/rule-engine';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const stubRule: GameLogicStateV1 = {
  version: 1,
  isFirstShot: false,
  tableIsOpened: true,
  turnIsChanged: false,
  currentPlayerIndex: 0,
  hasBallType: false,
  setBallTypeFlag: false,
  pocketedBalls: [],
  reservedBalls: [],
  players: [
    { ballType: 0, ballInHand: false, balls: [0, 0, 0, 0, 0, 0, 0] },
    { ballType: 0, ballInHand: false, balls: [0, 0, 0, 0, 0, 0, 0] },
  ],
  lastReason: 0,
  gameIsEnded: false,
  isWinner: false,
  shotStartedAt: 0,
};

describe('GameSaveManager DATA-001', () => {
  let now: number;
  let storage: ReturnType<typeof memStorage>;
  let mgr: ReturnType<typeof createGameSaveManager>;

  beforeEach(() => {
    now = 1_000_000;
    storage = memStorage();
    mgr = createGameSaveManager(storage, { nowMs: () => now });
  });

  function saveAt(t: number, shotTimeS = 30): void {
    mgr.saveGameState({
      g: stubRule,
      p: 'phys-state',
      t,
      shotTimeS,
      phase: 'Aiming',
      currentPlayerIndex: 0,
      ballInHand: false,
    });
  }

  it('save → get restores p and g', () => {
    saveAt(now);
    const s = mgr.getGameState();
    expect(s?.p).toBe('phys-state');
    expect(s?.g.tableIsOpened).toBe(true);
    expect(storage.getItem(GAME_SAVE_LS_KEY)).toBeTruthy();
  });

  it('isSavedGame true within 1.5×shotTime window', () => {
    // shotTime 30s → TTL 45s
    saveAt(now);
    now += 40_000;
    expect(mgr.isSavedGame()).toBe(true);
  });

  it('isSavedGame false after TTL expires', () => {
    saveAt(now, 30);
    now += 46_000; // > 45s
    expect(mgr.isSavedGame()).toBe(false);
  });

  it('clearGameState removes save', () => {
    saveAt(now);
    mgr.clearGameState();
    expect(mgr.getGameState()).toBeNull();
    expect(mgr.isSavedGame()).toBe(false);
  });

  it('rejects corrupt JSON', () => {
    storage.setItem(GAME_SAVE_LS_KEY, '{not json');
    expect(mgr.getGameState()).toBeNull();
  });
});
