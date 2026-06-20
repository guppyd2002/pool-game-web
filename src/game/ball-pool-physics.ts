/**
 * G6 — BallPoolPhysics 抽象層（PHY-019）。
 *
 * 邊界：球桿/規則/AI 層只透過 IBallPoolPhysics 與底層 CmSpace/CmRigidbody 互動。
 *
 * 確定性契約：
 *   C1  applyShot() 走 simulateToCompletion()（與 golden/fuzz 同源）。
 *       contacts 透過 optional onStep? 觀察者蒐集（純讀、不 mutate space）。
 *   C2  interface 對外只進出 Fixed 整數；step(dt) pacing 不影響物理量。
 *   C3  step() 不 mutate rigidbodies（C3-I1）；interface 不暴露 frameIdx（C3-I2）；
 *       getBall() 只讀 space.rigidbodies（C3-I3）。
 *   C4  所有物理常數從 constants.ts 投影，不另存副本。
 */

import { toFloat } from '../physics/fixed-math';
import { MULTIPLIER } from '../physics/fixed-math';
import type { Fixed } from '../physics/fixed-math';
import { CmVector } from '../physics/cm-vector';
import { CmSpace } from '../physics/cm-space';
import { CmLineCollider } from '../physics/colliders';
import { CmForceMode } from '../physics/cm-rigidbody';
import type { CmRigidbody } from '../physics/cm-rigidbody';
import type { SceneAPI } from '../renderer/scene';
import {
  BALL_RADIUS, BALL_MASS, MAX_FORCE,
  SPACE_SCALE_X, SPACE_SCALE_Z,
} from '../physics/constants';
import { simulateToCompletion, MAX_SIM_STEPS } from '../physics/simulate';
export type { SimFrame } from '../physics/simulate';
import type { SimFrame } from '../physics/simulate';

// ─── Types (§2 contract) ──────────────────────────────────────────────────────

export interface ShotData {
  readonly position: CmVector;
  readonly impulse: CmVector;
  readonly torque: CmVector;
}

export interface BallState {
  readonly id: number;
  readonly position: CmVector;
  readonly velocity: CmVector;
  readonly angularVelocity: CmVector;
  readonly isActive: boolean;
  readonly isKinematic: boolean;
  readonly isOutOfTable: boolean;
}

export interface ContactEvent {
  readonly stepIndex: number;
  readonly kind: 'ball' | 'cushion';
  readonly ballId: number;
  readonly otherBallId: number | null;
  readonly cushionId: number | null;
}

export interface ShotResult {
  readonly frames: readonly SimFrame[];
  readonly finalStates: readonly BallState[];
  readonly pocketed: readonly { readonly ballId: number; readonly pocketId: number; readonly stepIndex: number }[];
  readonly outOfTable: readonly { readonly ballId: number; readonly stepIndex: number }[];
  readonly contacts: readonly ContactEvent[];
}

export interface AimHit {
  readonly hitType: 'ball' | 'cushion' | 'none';
  readonly ballId: number | null;
  readonly cushionId: number | null;
  readonly point: CmVector;
  readonly normal: CmVector;
  readonly distance: Fixed;
}

export interface PhysicsConstants {
  readonly ballMass: Fixed;
  readonly ballRadius: Fixed;
  readonly maxForce: Fixed;
  readonly tableScaleX: Fixed;
  readonly tableScaleZ: Fixed;
}

// ─── Interface (§3 contract) ──────────────────────────────────────────────────

export interface IBallPoolPhysics {
  applyShot(shot: ShotData): ShotResult;
  readonly shotFrames: readonly SimFrame[];
  getBall(id: number): BallState;
  getActiveBalls(): readonly BallState[];
  readonly allBalls: readonly BallState[];
  predictAimLine(from: CmVector, dir: CmVector): AimHit;
  step(dt: number): void;
  start(): void;
  stop(): void;
  readonly isSimulating: boolean;
  getStateAsString(): string;
  setStateFromString(state: string): void;
  resetToStartState(): void;
  getPhysicsConstants(): PhysicsConstants;
  // G5 seam — placeBall / respotCueBall declared here, implemented in G5 (PHY-016):
  // placeBall(id: number, position: CmVector): void;
  // respotCueBall(): void;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function bodyToBallState(body: CmRigidbody): BallState {
  return {
    id: body.id,
    position: body.collider.position,
    velocity: body.velocity,
    angularVelocity: body.angularVelocity,
    isActive: body.isActive,
    isKinematic: body.isKinematic,
    isOutOfTable: body.isOutOfCube,
  };
}

// ─── PHY-009: Analytic SphereCast (matches C# SphereCastManager.SphereCast) ──
// UX-only, non-deterministic (float arithmetic). Not used in physics simulation.

function analyticSphereCast(from: CmVector, dir: CmVector, space: CmSpace): AimHit {
  const M = MULTIPLIER;
  const noneHit: AimHit = { hitType: 'none', ballId: null, cushionId: null, point: from, normal: CmVector.zero, distance: 0 };

  if (dir.x === 0 && dir.y === 0 && dir.z === 0) return noneHit;

  const r = BALL_RADIUS / M;          // ball radius in float meters
  const maxD = (SPACE_SCALE_X * 2) / M;  // max search in float meters

  // From/dir in float
  const fx = from.x / M, fy = from.y / M, fz = from.z / M;
  const rawMag = Math.sqrt((dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) / (M * M));
  if (rawMag < 1e-9) return noneHit;
  const dx = dir.x / M / rawMag, dy = dir.y / M / rawMag, dz = dir.z / M / rawMag;

  // ── Ball detection (C# SphereCastManager ball loop) ──────────────────────
  let bestBallD = maxD;
  let bestBallHit: AimHit | null = null;
  const diam2 = 4 * r * r;  // diameter squared

  for (const body of space.rigidbodies) {
    if (body.isKinematic || body.isOutOfCube) continue;
    const bx = body.collider.position.x / M;
    const by = body.collider.position.y / M;
    const bz = body.collider.position.z / M;
    if (bx === fx && by === fy && bz === fz) continue;  // skip cue ball at origin

    const tx = bx - fx, ty = by - fy, tz = bz - fz;
    const dotFwd = dx * tx + dy * ty + dz * tz;
    if (dotFwd <= 0) continue;  // behind

    const perpX = tx - dx * dotFwd, perpY = ty - dy * dotFwd, perpZ = tz - dz * dotFwd;
    const perpD2 = perpX * perpX + perpY * perpY + perpZ * perpZ;
    if (perpD2 >= diam2) continue;  // miss

    const cDist = dotFwd - Math.sqrt(diam2 - perpD2);
    if (cDist <= 0 || cDist >= bestBallD) continue;

    bestBallD = cDist;
    const spX = fx + dx * cDist, spY = fy + dy * cDist, spZ = fz + dz * cDist;
    const nm = Math.sqrt((spX - bx) ** 2 + (spY - by) ** 2 + (spZ - bz) ** 2) || 1;
    const nX = (spX - bx) / nm, nY = (spY - by) / nm, nZ = (spZ - bz) / nm;
    bestBallHit = {
      hitType: 'ball', ballId: body.id, cushionId: null,
      point: new CmVector(Math.round((bx + r * nX) * M), Math.round((by + r * nY) * M), Math.round((bz + r * nZ) * M)),
      normal: new CmVector(Math.round(nX * M), Math.round(nY * M), Math.round(nZ * M)),
      distance: Math.round(cDist * M),
    };
  }

  // ── Board/Rail detection (C# SphereCastManager board loop) ───────────────
  let bestBoardD = maxD;
  let bestBoardHit: AimHit | null = null;

  for (const collider of space.colliders) {
    if (!(collider instanceof CmLineCollider)) continue;

    // board.normal = collider.forward (inward-pointing unit vector in Fixed)
    const nX = collider.forward.x / M, nY = collider.forward.y / M, nZ = collider.forward.z / M;
    const cX = collider.position.x / M, cY = collider.position.y / M, cZ = collider.position.z / M;
    const aX = collider.right.x / M, aY = collider.right.y / M, aZ = collider.right.z / M;
    const halfLen = collider.scale.x / (2 * M);

    // dot = -Dot(dir, normal) — must be > 0 (moving toward board)
    const dotDN = dx * nX + dy * nY + dz * nZ;
    const dotBoard = -dotDN;
    if (dotBoard <= 0) continue;

    // sideCheck = Dot(from - center, normal) — must be ≥ 0 (on correct side)
    const sideCheck = (fx - cX) * nX + (fy - cY) * nY + (fz - cZ) * nZ;
    if (sideCheck <= r) continue;  // already touching or on wrong side

    const distH = sideCheck;
    const length = distH / dotBoard;
    const distL = Math.sqrt(Math.max(0, length * length - distH * distH));
    const distP = distL * (1 - r / distH);

    // projDir = ProjectOnPlane(dir, normal).normalized
    const prX = dx - dotDN * nX, prY = dy - dotDN * nY, prZ = dz - dotDN * nZ;
    const prMag = Math.sqrt(prX * prX + prY * prY + prZ * prZ);
    const pdX = prMag > 1e-9 ? prX / prMag : aX;
    const pdY = prMag > 1e-9 ? prY / prMag : aY;
    const pdZ = prMag > 1e-9 ? prZ / prMag : aZ;

    // pointOnLine = from - distH * normal (projection of from onto board plane)
    const polX = fx - distH * nX, polY = fy - distH * nY, polZ = fz - distH * nZ;

    // hitPoint on board surface
    const hpX = polX + distP * pdX, hpY = polY + distP * pdY, hpZ = polZ + distP * pdZ;

    // Bounds check: distance of hitPoint from board center along rail axis
    const hitAxialDist = Math.abs((hpX - cX) * aX + (hpY - cY) * aY + (hpZ - cZ) * aZ);
    if (hitAxialDist > halfLen) continue;

    // Sphere center at collision
    const spX = hpX + r * nX, spY = hpY + r * nY, spZ = hpZ + r * nZ;
    const cDist = Math.sqrt((spX - fx) ** 2 + (spY - fy) ** 2 + (spZ - fz) ** 2);
    if (cDist <= 0 || cDist >= bestBoardD) continue;

    bestBoardD = cDist;
    bestBoardHit = {
      hitType: 'cushion', ballId: null, cushionId: collider.id,
      point: new CmVector(Math.round(hpX * M), Math.round(hpY * M), Math.round(hpZ * M)),
      normal: new CmVector(Math.round(nX * M), Math.round(nY * M), Math.round(nZ * M)),
      distance: Math.round(cDist * M),
    };
  }

  if (bestBallD < bestBoardD && bestBallHit) return bestBallHit;
  if (bestBoardD < bestBallD && bestBoardHit) return bestBoardHit;

  const endX = Math.round((fx + dx * maxD) * M);
  const endY = Math.round((fy + dy * maxD) * M);
  const endZ = Math.round((fz + dz * maxD) * M);
  return { ...noneHit, point: new CmVector(endX, endY, endZ), distance: Math.round(maxD * M) };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBallPoolPhysics(space: CmSpace, renderer: SceneAPI): IBallPoolPhysics {
  // Replay state
  let _frames: SimFrame[] = [];
  let frameIdx = 0;
  let replayAccumulator = 0;
  let _isSimulating = false;

  // rAF render loop
  let running = false;
  let animId = 0;
  let lastTime = 0;

  // Initial table state for resetToStartState (captured on construction)
  const _startState = space.getStringState();

  function syncFrame(idx: number): void {
    const frame = _frames[idx];
    for (const p of frame.positions) {
      renderer.updateBallPosition(p.id, toFloat(p.x), toFloat(p.y), toFloat(p.z));
    }
  }

  // C3-I1: step() only reads frames[], never mutates space.rigidbodies.
  function step(dt: number): void {
    if (_frames.length === 0 || frameIdx >= _frames.length) {
      _isSimulating = false;
      return;
    }
    _isSimulating = true;
    replayAccumulator += dt;

    while (frameIdx < _frames.length && replayAccumulator >= toFloat(_frames[frameIdx].timestep)) {
      replayAccumulator -= toFloat(_frames[frameIdx].timestep);
      frameIdx++;
    }

    syncFrame(Math.min(frameIdx, _frames.length - 1));

    if (frameIdx >= _frames.length) {
      _isSimulating = false;
      replayAccumulator = 0;
    }
  }

  function rafFrame(timestamp: number): void {
    if (!running) return;
    const dt = lastTime === 0 ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    step(dt);
    renderer.render();
    animId = requestAnimationFrame(rafFrame);
  }

  return {
    // ── 出桿 ───────────────────────────────────────────────────────────────

    applyShot(shot: ShotData): ShotResult {
      const cueBall = space.rigidbodies[0];
      if (cueBall.isKinematic || cueBall.isOutOfCube) {
        return { frames: [], finalStates: space.rigidbodies.map(bodyToBallState), pocketed: [], outOfTable: [], contacts: [] };
      }

      // PHY-003: clamp impulse magnitude to MAX_FORCE
      const imp = shot.impulse;
      const mag2 = imp.x * imp.x + imp.y * imp.y + imp.z * imp.z;
      const maxMag2 = MAX_FORCE * MAX_FORCE;
      const safeImpulse = mag2 > maxMag2
        ? new CmVector(
            Math.trunc(imp.x * MAX_FORCE / Math.sqrt(mag2)),
            Math.trunc(imp.y * MAX_FORCE / Math.sqrt(mag2)),
            Math.trunc(imp.z * MAX_FORCE / Math.sqrt(mag2)),
          )
        : imp;

      // Reset per shot — kinematicStates cleared at :125 inside activate()
      space.activate();
      cueBall.isActive = true;
      cueBall.addImpulse(safeImpulse, shot.position, CmForceMode.Impulse);

      if (!(shot.torque.x === 0 && shot.torque.y === 0 && shot.torque.z === 0)) {
        cueBall.addTorque(shot.torque, CmForceMode.Impulse);
      }

      // Contacts collection via C1-observer (S1-S4, §2.1)
      const activeContacts = new Set<string>();
      const rawContacts: ContactEvent[] = [];

      // pocketed / outOfTable detected via onStep transition (not time→step reconstruction).
      // Root cause of the old approach: frames[i].timestep = T_{i-1} (physDt is snapshotted
      // BEFORE _getActiveBodies() updates space.timestep), so cumTimes drifts from
      // calculateTime and timeToStep.get() returns undefined → ?? 0 silently zeroes stepIndex.
      // Fix: detect isKinematic/isOutOfCube false→true edges directly in onStep, where
      // stepIndex is the exact loop counter — no time reconstruction needed.
      const pocketed: { ballId: number; pocketId: number; stepIndex: number }[] = [];
      const outOfTable: { ballId: number; stepIndex: number }[] = [];
      const seenPocketed = new Set<number>();
      const seenOOT = new Set<number>();
      const prevKinematic = new Map<number, boolean>();
      const prevOutOfCube = new Map<number, boolean>();
      for (const b of space.rigidbodies) {
        prevKinematic.set(b.id, b.isKinematic);
        prevOutOfCube.set(b.id, b.isOutOfCube);
      }

      // C1: canonical loop — no-callback path byte-identical to golden/fuzz
      const frames = simulateToCompletion(space, MAX_SIM_STEPS, (sp, stepIndex) => {
        const currentContacts = new Set<string>();

        for (const body of sp.rigidbodies) {
          // S2: ball-ball — normalize to (min, max) to dedup reciprocal entries
          for (const otherId of body.hitBodies) {
            const a = Math.min(body.id, otherId);
            const b = Math.max(body.id, otherId);
            currentContacts.add(`b:${a}:${b}`);
          }
          // Cushion contacts — per-body direction preserved
          for (const colId of body.hitColliders) {
            currentContacts.add(`c:${body.id}:${colId}`);
          }

          // Pocket / OOT: detect false→true transition, record true step number.
          // body.kinematicTriggerId is already set by calculateHitTrigger before onStep fires.
          if (body.isKinematic && !prevKinematic.get(body.id) && !seenPocketed.has(body.id)) {
            seenPocketed.add(body.id);
            pocketed.push({ ballId: body.id, pocketId: body.kinematicTriggerId, stepIndex });
          }
          prevKinematic.set(body.id, body.isKinematic);

          if (body.isOutOfCube && !prevOutOfCube.get(body.id) && !seenOOT.has(body.id)) {
            seenOOT.add(body.id);
            outOfTable.push({ ballId: body.id, stepIndex });
          }
          prevOutOfCube.set(body.id, body.isOutOfCube);
        }

        // S1: record only false→true edge (onset-only)
        for (const key of currentContacts) {
          if (!activeContacts.has(key)) {
            const p = key.split(':');
            if (p[0] === 'b') {
              rawContacts.push({
                stepIndex,
                kind: 'ball',
                ballId: parseInt(p[1], 10),
                otherBallId: parseInt(p[2], 10),
                cushionId: null,
              });
            } else {
              rawContacts.push({
                stepIndex,
                kind: 'cushion',
                ballId: parseInt(p[1], 10),
                otherBallId: null,
                cushionId: parseInt(p[2], 10),
              });
            }
          }
        }

        // Advance contact state for S1 tracking
        activeContacts.clear();
        for (const key of currentContacts) activeContacts.add(key);
      });

      // S3: stable sort by (stepIndex, kind: ball<cushion, ballId asc, other asc)
      rawContacts.sort((a, b) => {
        if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
        if (a.kind !== b.kind) return a.kind === 'ball' ? -1 : 1;
        if (a.ballId !== b.ballId) return a.ballId - b.ballId;
        return (a.otherBallId ?? a.cushionId ?? 0) - (b.otherBallId ?? b.cushionId ?? 0);
      });

      // Update replay state
      _frames = frames;
      frameIdx = 0;
      replayAccumulator = 0;
      _isSimulating = frames.length > 0;

      return {
        frames,
        finalStates: space.rigidbodies.map(bodyToBallState),
        pocketed,
        outOfTable,
        contacts: rawContacts,
      };
    },

    get shotFrames(): readonly SimFrame[] { return _frames; },

    // ── canonical-only 讀取（C3-I3）──────────────────────────────────────

    // C3-I3: reads space.rigidbodies, never frames[]
    getBall(id: number): BallState {
      return bodyToBallState(space.rigidbodies[id]);
    },

    getActiveBalls(): readonly BallState[] {
      return space.rigidbodies
        .filter(b => !b.isKinematic && !b.isOutOfCube)
        .map(bodyToBallState);
    },

    get allBalls(): readonly BallState[] {
      return space.rigidbodies.map(bodyToBallState);
    },

    // ── 瞄準預測（PHY-009，read-only preview）────────────────────────────

    predictAimLine(from: CmVector, dir: CmVector): AimHit {
      return analyticSphereCast(from, dir, space);
    },

    // ── render replay（renderer 專用，C3-I1: no rigidbody mutation）───────

    step,

    start(): void {
      if (running) return;
      running = true;
      lastTime = 0;
      replayAccumulator = 0;
      for (const body of space.rigidbodies) {
        renderer.updateBallPosition(
          body.id,
          toFloat(body.collider.position.x),
          toFloat(body.collider.position.y),
          toFloat(body.collider.position.z),
        );
      }
      animId = requestAnimationFrame(rafFrame);
    },

    stop(): void {
      running = false;
      cancelAnimationFrame(animId);
    },

    get isSimulating(): boolean { return _isSimulating; },

    // ── state 快照 ────────────────────────────────────────────────────────

    getStateAsString(): string {
      return space.getStringState();
    },

    setStateFromString(state: string): void {
      space.setStateFromString(state, null);
    },

    resetToStartState(): void {
      space.setStateFromString(_startState, null);
    },

    // ── 物理常數（C4：從 constants.ts 投影）───────────────────────────────

    getPhysicsConstants(): PhysicsConstants {
      return {
        ballMass: BALL_MASS,
        ballRadius: BALL_RADIUS,
        maxForce: MAX_FORCE,
        tableScaleX: SPACE_SCALE_X,
        tableScaleZ: SPACE_SCALE_Z,
      };
    },
  };
}
