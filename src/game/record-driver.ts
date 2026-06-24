/**
 * Record driver — accumulates per-shot records and serializes to the core record format.
 *
 * Design (consensus 2026-06-24):
 *   Two-layer architecture:
 *   (A) Core record: inputs + seed + engine version (minimal, always-on).
 *   (B) Debug capture: per-shot ball state + AI decisions (opt-in, managed separately).
 *
 *   Mode A playback: feeds recorded shotData back to session.forceShot — fast, no checksum.
 *   Mode B CI gate: re-runs from seed via runHeadlessGame + validates per-shot checksums.
 *
 * computeShotChecksum lives in game-session.ts (avoids circular dep) and is re-exported here
 * for external callers (tests, replay-controller).
 */

export { computeShotChecksum } from './game-session';

import { MULTIPLIER } from '../physics/fixed-math';
import { BALL_RADIUS, MAX_FORCE, MAX_SIM_STEPS } from '../physics/constants';
import type { RecordedShot } from './game-session';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RecordPlayerConfig {
  type: 'AI' | 'Human';
  rank?: number;   // AI only
}

export interface RecordConfig {
  engineVersion: string;         // git commit SHA (pass from env/build metadata)
  players: [RecordPlayerConfig, RecordPlayerConfig];
  gameSeed: number;              // AI demo base seed (0 for human games)
}

export interface RecordOutcome {
  winner: 0 | 1 | null;
  reason: number;
  totalShots: number;
}

/** Live record accumulator returned by createRecordDriver(). */
export interface RecordHandle {
  shots: RecordedShot[];
  /** Serialize to the core record JSON string. Call after finalize(). */
  toJSON(): string;
}

/** Controller returned by createRecordDriver(). */
export interface RecordDriverHandle {
  driver: {
    /** Wire to session.onShotFired to accumulate shots. */
    onShotFired(shot: RecordedShot): void;
    /** Call on game-over to stamp the outcome. */
    finalize(outcome: RecordOutcome): void;
  };
  record: RecordHandle;
}

// ─── Constants snapshot ───────────────────────────────────────────────────────

/** Physics constants pinned in the record for cross-version drift detection. */
const CONSTANTS_SNAPSHOT = {
  MULTIPLIER,
  BALL_RADIUS,
  MAX_FORCE,
  MAX_SIM_STEPS,
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a RecordDriver that accumulates shots via onShotFired and can serialize them.
 * Wire: `session.onShotFired = driver.onShotFired;`
 */
export function createRecordDriver(config: RecordConfig): RecordDriverHandle {
  const shots: RecordedShot[] = [];
  let _outcome: RecordOutcome | null = null;

  const record: RecordHandle = {
    shots,
    toJSON(): string {
      return JSON.stringify({
        v: '1',
        engine: config.engineVersion,
        constants: CONSTANTS_SNAPSHOT,
        config: {
          players: config.players,
          gameSeed: config.gameSeed,
        },
        shots: shots.map(s => ({
          n: s.n,
          player: s.player,
          shotData: {
            position: { x: s.shotData.position.x, y: s.shotData.position.y, z: s.shotData.position.z },
            impulse:  { x: s.shotData.impulse.x,  y: s.shotData.impulse.y,  z: s.shotData.impulse.z  },
            torque:   { x: s.shotData.torque.x,   y: s.shotData.torque.y,   z: s.shotData.torque.z   },
          },
          cueBallPlaced: s.cueBallPlaced
            ? { x: s.cueBallPlaced.x, y: s.cueBallPlaced.y, z: s.cueBallPlaced.z }
            : null,
          checksum: s.checksum,
          // physicsState and ruleState excluded from core record (they're debug-layer data).
          // The checksum already commits to their content; re-running from seed+shotData
          // regenerates them on demand.
        })),
        outcome: _outcome ?? { winner: null, reason: 0, totalShots: shots.length },
      }, null, 0);  // compact JSON — minimize download size
    },
  };

  return {
    driver: {
      onShotFired(shot: RecordedShot): void {
        shots.push(shot);
      },
      finalize(outcome: RecordOutcome): void {
        _outcome = outcome;
      },
    },
    record,
  };
}

// ─── Download helper ──────────────────────────────────────────────────────────

/**
 * Trigger a browser file download of the core record JSON.
 * Filename: `{mode}-{seed}-{timestamp}.poolrecord`
 */
export function downloadRecord(record: RecordHandle, config: RecordConfig): void {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mode = config.players.every(p => p.type === 'AI') ? 'ai-selfplay' : 'hotseat';
  const filename = `${mode}-${config.gameSeed}-${ts}.poolrecord`;
  const blob = new Blob([record.toJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
