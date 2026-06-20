/**
 * CmSpace — port of C# CmSpace (physical space main controller).
 * Handles spatial hashing, adaptive timestep, and simulation loop.
 *
 * All divisions use Math.trunc() to match C# long integer semantics.
 */

import type { Fixed } from './fixed-math';
import { MULTIPLIER, fixDiv, fixClamp, fixPowSave, fixAbs } from './fixed-math';
import { CmVector } from './cm-vector';
import type { ICmCollider } from './colliders';
import { CmRigidbody, CmKinematicTrigger } from './cm-rigidbody';
import { CmCollisionManager } from './cm-collision';
import type { CmSpaceCube } from './cm-collision';
import { CmRigidbodyState, CmSpaceState, CmKinematicState } from './cm-state';
import { CmSimpleVector } from './cm-vector';
import { MIN_TS, MAX_TS, PRECISION } from './constants';

// ─── Spatial hash key ────────────────────────────────────────────────────────

/** String key for spatial hash map (value equality for CmVector) */
function spaceKey(v: CmVector): string {
  return `${v.x},${v.y},${v.z}`;
}

// ─── CmSpace ─────────────────────────────────────────────────────────────────

/** Physical space controller (matches C# CmSpace) */
export class CmSpace {
  isActive = false;
  rigidbodies: CmRigidbody[] = [];
  colliders: ICmCollider[] = [];
  triggers: CmKinematicTrigger[] = [];
  timestep: Fixed = MAX_TS;
  subspacesScale: Fixed = 0;
  kinematicStates = '';

  private subspacesScaleHalf: Fixed = 0;
  private subspacesScalePow: Fixed = 0;
  private spaceCube!: CmSpaceCube;
  private dynamicSubspaces = new Map<string, number[]>();
  private staticSubspaces = new Map<string, number[]>();
  private kinematicSubspaces = new Map<string, number[]>();
  calculateTime: Fixed = 0;
  private savedState: CmSpaceState | null = null;
  private bodyUpdateCallback: ((body: CmRigidbody) => void) | null = null;

  // Per-body tracking for old position optimization
  private bodyOldPositions = new Map<number, CmVector>();
  private bodyOnePositions = new Map<number, CmVector>();
  private bodySubPositions = new Map<number, CmVector>();

  /** Initialize space with cube bounds, bodies, colliders, and triggers */
  init(spaceCube: CmSpaceCube, bodies: CmRigidbody[], colliders: ICmCollider[], triggers: CmKinematicTrigger[]): void {
    this.spaceCube = spaceCube;
    this.rigidbodies = [];
    this.colliders = [];
    this.triggers = triggers;
    for (let i = 0; i < triggers.length; i++) {
      triggers[i].id = i;
    }
    this.subspacesScale = 0;

    let instanceId = 0;

    // Process bodies — determine subspaceScale from largest radius
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const sSize = 8 * body.collider.radius;
      if (this.subspacesScale < sSize) this.subspacesScale = sSize;
      body.id = i; // C# uses list index as Id
      body.collider.id = i;
      body.collider.instanceId = instanceId;
      body.collider.enabled = true;
      body.init();
      this.rigidbodies.push(body);
      instanceId++;
    }

    this.subspacesScaleHalf = Math.trunc(this.subspacesScale / 2);
    this.subspacesScalePow = fixPowSave(this.subspacesScale);

    // Process static colliders
    for (let i = 0; i < colliders.length; i++) {
      const collider = colliders[i];
      collider.id = i; // C# uses list index as Id
      collider.instanceId = instanceId;
      collider.enabled = true;
      this.colliders.push(collider);
      instanceId++;
    }

    // Assign body instanceIds
    for (const body of bodies) {
      body.instanceId = instanceId;
      instanceId++;
    }

    // Build static subspaces
    this.staticSubspaces.clear();
    this.dynamicSubspaces.clear();
    this.kinematicSubspaces.clear();

    for (const collider of this.colliders) {
      const halfScale = new CmVector(
        Math.trunc(collider.getSubspaceScale().x / 2),
        Math.trunc(collider.getSubspaceScale().y / 2),
        Math.trunc(collider.getSubspaceScale().z / 2),
      );
      this._createSubspacesForCollider(collider.id, collider.position, halfScale, this.staticSubspaces, collider);
    }

    for (const trigger of this.triggers) {
      const halfScale = new CmVector(trigger.radius, trigger.radius, trigger.radius);
      this._createSubspacesForTrigger(trigger.id, trigger.position, halfScale, this.kinematicSubspaces, trigger);
    }

    this.activate();
  }

  /** Activate the space for simulation */
  activate(): void {
    this.isActive = true;
    this.calculateTime = 0;
    this.kinematicStates = '';
  }

  /** Main simulation step (matches C# Calculate) */
  calculate(bodyUpdateCallback: ((body: CmRigidbody) => void) | null, addKinematicState: boolean): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.bodyUpdateCallback = bodyUpdateCallback;

    this._getActiveBodies();
    this.dynamicSubspaces.clear();
    this._createSubspaces(this.timestep, addKinematicState);
    this.calculateTime += this.timestep;
  }

  /** Determine adaptive timestep and check which bodies are active */
  private _getActiveBodies(): void {
    let tsPow: Fixed = 10000;
    let needBody = this.rigidbodies[0];

    for (const body of this.rigidbodies) {
      if (this.isActive) {
        const velSqrMag = body.velocity.sqrMagnitude;
        if (velSqrMag !== 0) {
          const needTsPow = fixDiv(body.collider.radiusPow, velSqrMag);
          if (tsPow > needTsPow) {
            tsPow = needTsPow;
            needBody = body;
          }
        }
      }
      if (body.isActive) {
        this.isActive = true;
      }
    }

    const velocityMagnitude = needBody.velocity.magnitude;
    let needTs = MAX_TS;
    if (velocityMagnitude !== 0) {
      needTs = fixClamp(Math.trunc(fixDiv(needBody.collider.radius, velocityMagnitude) / PRECISION), MIN_TS, MAX_TS);
    }
    this.timestep = needTs;
  }

  /** Move bodies and create dynamic subspaces for collision detection */
  private _createSubspaces(timestep: Fixed, addKinematicState: boolean): void {
    for (const body of this.rigidbodies) {
      this._moveAndCheckBody(body, timestep, addKinematicState);
      if (!body.isKinematic && !body.isOutOfCube) {
        this._createSubspaceForBody(body);
      }
    }
  }

  /** Move body, apply gravity, check deactivation */
  private _moveAndCheckBody(body: CmRigidbody, timestep: Fixed, addKinematicState: boolean): void {
    if (body.isKinematic || body.isOutOfCube) return;

    body.moveAndCheckIsActive(timestep);

    if (body.isActive) {
      // Move: position += multiply(velocity, timestep)
      const delta = CmVector.multiply(body.velocity, timestep);
      body.collider.position = CmVector.add(body.collider.position, delta);
      body.hitColliders = [];
    }

    body.hitBodies = [];
    body.hitInfo = { isBody: false, point: CmVector.zero, normal: CmVector.zero, collider: null };
    this.bodyUpdateCallback?.(body);
  }

  /** Get one-position (grid-snapped) for spatial hashing */
  private _getOnePosition(bodyPosition: CmVector): CmVector {
    // (bodyPosition / subspacesScale) * subspacesScale
    return new CmVector(
      Math.trunc(bodyPosition.x / this.subspacesScale) * this.subspacesScale,
      Math.trunc(bodyPosition.y / this.subspacesScale) * this.subspacesScale,
      Math.trunc(bodyPosition.z / this.subspacesScale) * this.subspacesScale,
    );
  }

  /** Get sub-position offset for boundary-crossing detection */
  private _getSubPosition(bodyPosition: CmVector, position: CmVector, radius: Fixed): CmVector {
    const deltaPos = this.subspacesScaleHalf - radius;
    const rX = bodyPosition.x - position.x;
    const rY = bodyPosition.y - position.y;
    const rZ = bodyPosition.z - position.z;
    const deltaPosX = rX >= deltaPos ? 1 : (rX <= -deltaPos ? -1 : 0);
    const deltaPosY = rY >= deltaPos ? 1 : (rY <= -deltaPos ? -1 : 0);
    const deltaPosZ = rZ >= deltaPos ? 1 : (rZ <= -deltaPos ? -1 : 0);
    return new CmVector(
      this.subspacesScale * deltaPosX,
      this.subspacesScale * deltaPosY,
      this.subspacesScale * deltaPosZ,
    );
  }

  /** Place body into dynamic subspaces (1-8 cells) */
  private _createSubspaceForBody(body: CmRigidbody): void {
    const position = this._getOnePosition(body.collider.position);
    this._createDynamicSubspace(position, body);
    const subPosition = this._getSubPosition(body.collider.position, position, body.collider.radius);

    // Create near subspaces based on boundary crossing
    if (subPosition.x !== 0) {
      this._createDynamicSubspace(CmVector.add(position, new CmVector(subPosition.x, 0, 0)), body);
      if (subPosition.y !== 0) {
        this._createDynamicSubspace(CmVector.add(position, new CmVector(0, subPosition.y, 0)), body);
        this._createDynamicSubspace(CmVector.add(position, new CmVector(subPosition.x, subPosition.y, 0)), body);
        if (subPosition.z !== 0) {
          this._createDynamicSubspace(CmVector.add(position, new CmVector(0, 0, subPosition.z)), body);
          this._createDynamicSubspace(CmVector.add(position, new CmVector(subPosition.x, 0, subPosition.z)), body);
          this._createDynamicSubspace(CmVector.add(position, new CmVector(0, subPosition.y, subPosition.z)), body);
          this._createDynamicSubspace(CmVector.add(position, new CmVector(subPosition.x, subPosition.y, subPosition.z)), body);
        }
      } else if (subPosition.z !== 0) {
        this._createDynamicSubspace(CmVector.add(position, new CmVector(0, 0, subPosition.z)), body);
        this._createDynamicSubspace(CmVector.add(position, new CmVector(subPosition.x, 0, subPosition.z)), body);
      }
    } else {
      if (subPosition.y !== 0) {
        this._createDynamicSubspace(CmVector.add(position, new CmVector(0, subPosition.y, 0)), body);
        if (subPosition.z !== 0) {
          this._createDynamicSubspace(CmVector.add(position, new CmVector(0, 0, subPosition.z)), body);
          this._createDynamicSubspace(CmVector.add(position, new CmVector(0, subPosition.y, subPosition.z)), body);
        }
      } else if (subPosition.z !== 0) {
        this._createDynamicSubspace(CmVector.add(position, new CmVector(0, 0, subPosition.z)), body);
      }
    }
  }

  /** Insert body into a dynamic subspace cell and run collision checks */
  private _createDynamicSubspace(position: CmVector, body: CmRigidbody): void {
    if (!CmCollisionManager.sphereIsHitSubspace(body.collider.position, body.collider.radiusPow, this.subspacesScaleHalf, position)) {
      return;
    }

    const key = spaceKey(position);

    // Out of cube check
    if (body.isActive && !body.isOutOfCube) {
      body.calculateOutOfCube(this.spaceCube);
      if (body.isOutOfCube) {
        this.kinematicStates += new CmKinematicState(
          body.id, this.calculateTime, body.isActive,
          body.collider.position.toCmSimpleVector(),
          body.velocity.toCmSimpleVector(),
          body.angularVelocity.toCmSimpleVector(),
          body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
        ).toString();
        this.bodyUpdateCallback?.(body);
      }
    }

    // Kinematic trigger check
    if (body.isActive && !body.isOutOfCube && !body.isKinematic) {
      const kinematicIds = this.kinematicSubspaces.get(key);
      if (kinematicIds) {
        for (const triggerId of kinematicIds) {
          body.calculateHitTrigger(this.triggers[triggerId]);
          if (body.isKinematic) {
            this.kinematicStates += new CmKinematicState(
              body.id, this.calculateTime, body.isActive,
              body.collider.position.toCmSimpleVector(),
              body.velocity.toCmSimpleVector(),
              body.angularVelocity.toCmSimpleVector(),
              body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
            ).toString();
            this.bodyUpdateCallback?.(body);
            break;
          }
        }
      }
    }

    // Body-body collision in same cell
    const existing = this.dynamicSubspaces.get(key);
    if (!existing) {
      this.dynamicSubspaces.set(key, [body.id]);
    } else {
      for (const bodyId of existing) {
        const otherBody = this.rigidbodies[bodyId];
        if (body.isActive) {
          body.calculateHitBody(this.timestep, otherBody, () => {
            this.kinematicStates += new CmKinematicState(
              body.id, this.calculateTime, body.isActive,
              body.collider.position.toCmSimpleVector(),
              body.velocity.toCmSimpleVector(),
              body.angularVelocity.toCmSimpleVector(),
              body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
            ).toString();
          }, () => {
            this.kinematicStates += new CmKinematicState(
              body.id, this.calculateTime, body.isActive,
              body.collider.position.toCmSimpleVector(),
              body.velocity.toCmSimpleVector(),
              body.angularVelocity.toCmSimpleVector(),
              body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
            ).toString();
          });
        } else if (otherBody.isActive) {
          otherBody.calculateHitBody(this.timestep, body, () => {
            this.kinematicStates += new CmKinematicState(
              otherBody.id, this.calculateTime, otherBody.isActive,
              otherBody.collider.position.toCmSimpleVector(),
              otherBody.velocity.toCmSimpleVector(),
              otherBody.angularVelocity.toCmSimpleVector(),
              otherBody.isKinematic, otherBody.kinematicTriggerId, otherBody.isOutOfCube,
            ).toString();
          }, () => {
            this.kinematicStates += new CmKinematicState(
              otherBody.id, this.calculateTime, otherBody.isActive,
              otherBody.collider.position.toCmSimpleVector(),
              otherBody.velocity.toCmSimpleVector(),
              otherBody.angularVelocity.toCmSimpleVector(),
              otherBody.isKinematic, otherBody.kinematicTriggerId, otherBody.isOutOfCube,
            ).toString();
          });
        }
      }
      existing.push(body.id);
    }

    // Static collider check
    if (body.isActive) {
      const colliderIds = this.staticSubspaces.get(key);
      if (colliderIds) {
        for (const colliderId of colliderIds) {
          body.calculateHitCollider(this.timestep, this.colliders[colliderId], () => {
            this.kinematicStates += new CmKinematicState(
              body.id, this.calculateTime, body.isActive,
              body.collider.position.toCmSimpleVector(),
              body.velocity.toCmSimpleVector(),
              body.angularVelocity.toCmSimpleVector(),
              body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
            ).toString();
          }, () => {
            this.kinematicStates += new CmKinematicState(
              body.id, this.calculateTime, body.isActive,
              body.collider.position.toCmSimpleVector(),
              body.velocity.toCmSimpleVector(),
              body.angularVelocity.toCmSimpleVector(),
              body.isKinematic, body.kinematicTriggerId, body.isOutOfCube,
            ).toString();
          });
        }
      }
    }
  }

  /** Build static/kinematic subspaces for a collider */
  private _createSubspacesForCollider(id: number, position: CmVector, halfScale: CmVector, subspaces: Map<string, number[]>, collider: ICmCollider): void {
    const ss = this.subspacesScale;
    for (let x = position.x - halfScale.x - ss; x <= position.x + halfScale.x + ss; x += ss) {
      for (let y = position.y - halfScale.y - ss; y <= position.y + halfScale.y + ss; y += ss) {
        for (let z = position.z - halfScale.z - ss; z <= position.z + halfScale.z + ss; z += ss) {
          const onePos = this._getOnePosition(new CmVector(x, y, z));
          // Overlap check
          if (onePos.x - this.subspacesScaleHalf > position.x + halfScale.x ||
              onePos.x + this.subspacesScaleHalf < position.x - halfScale.x ||
              onePos.y - this.subspacesScaleHalf > position.y + halfScale.y ||
              onePos.y + this.subspacesScaleHalf < position.y - halfScale.y ||
              onePos.z - this.subspacesScaleHalf > position.z + halfScale.z ||
              onePos.z + this.subspacesScaleHalf < position.z - halfScale.z) {
            continue;
          }
          if (collider.isHitSubspace(this.subspacesScale, this.subspacesScalePow, onePos)) {
            const key = spaceKey(onePos);
            const existing = subspaces.get(key);
            if (existing) { existing.push(id); } else { subspaces.set(key, [id]); }
          }
        }
      }
    }
  }

  /** Build subspaces for a kinematic trigger */
  private _createSubspacesForTrigger(id: number, position: CmVector, halfScale: CmVector, subspaces: Map<string, number[]>, trigger: CmKinematicTrigger): void {
    const ss = this.subspacesScale;
    for (let x = position.x - halfScale.x - ss; x <= position.x + halfScale.x + ss; x += ss) {
      for (let y = position.y - halfScale.y - ss; y <= position.y + halfScale.y + ss; y += ss) {
        for (let z = position.z - halfScale.z - ss; z <= position.z + halfScale.z + ss; z += ss) {
          const onePos = this._getOnePosition(new CmVector(x, y, z));
          if (onePos.x - this.subspacesScaleHalf > position.x + halfScale.x ||
              onePos.x + this.subspacesScaleHalf < position.x - halfScale.x ||
              onePos.y - this.subspacesScaleHalf > position.y + halfScale.y ||
              onePos.y + this.subspacesScaleHalf < position.y - halfScale.y ||
              onePos.z - this.subspacesScaleHalf > position.z + halfScale.z ||
              onePos.z + this.subspacesScaleHalf < position.z - halfScale.z) {
            continue;
          }
          if (trigger.isHitSubspace(this.subspacesScale, this.subspacesScalePow, onePos)) {
            const key = spaceKey(onePos);
            const existing = subspaces.get(key);
            if (existing) { existing.push(id); } else { subspaces.set(key, [id]); }
          }
        }
      }
    }
  }

  // ─── State management ──────────────────────────────────────────────────

  /** Get current state */
  getState(): CmSpaceState {
    const states = this.rigidbodies.map(b => CmRigidbodyState.fromBody(b));
    return new CmSpaceState(states);
  }

  /** Set state from CmSpaceState object */
  setState(state: CmSpaceState, callback: ((body: CmRigidbody) => void) | null): void {
    for (let i = 0; i < state.states.length; i++) {
      this.rigidbodies[i].setState(state.states[i]);
    }
    this.dynamicSubspaces.clear();
    for (let i = 0; i < state.states.length; i++) {
      const body = this.rigidbodies[i];
      if (!body.isKinematic && !body.isOutOfCube) {
        this._createSubspaceForBody(body);
      }
      callback?.(body);
    }
  }

  /** Set state from string */
  setStateFromString(str: string, callback: ((body: CmRigidbody) => void) | null): void {
    this.setState(CmSpaceState.fromString(str), callback);
  }

  /** Get state as string */
  getStringState(): string {
    return this.getState().toStringState();
  }

  /** Save current state */
  saveState(): void {
    this.savedState = this.getState();
  }

  /** Reset to saved state */
  resetSavedState(callback: ((body: CmRigidbody) => void) | null): void {
    if (this.savedState) this.setState(this.savedState, callback);
  }

  /** Set body position by id */
  setBodyPosition(bodyId: number, position: CmVector): void {
    this.rigidbodies[bodyId].collider.position = position;
  }

  /**
   * PHY-016: Place a ball on a plane collider at the first unoccupied grid cell.
   *
   * Port of C# CmSpace.PutBallOnPlane.  Walks a cross pattern from the plane center:
   *   center → +right arm → -right arm → +forward arm → -forward arm
   * Each step is 3 * ball.radius.  Five subspace cells are checked per candidate
   * (center ± right*radius, center ± forward*radius).  Falls back to plane center
   * if all candidates are occupied or numberOfChecks exhausted.
   *
   * Reads dynamicSubspaces (populated by calculate() or setState()) for occupancy.
   * Does NOT update dynamicSubspaces after placement — the next calculate() will.
   */
  putBallOnPlane(
    bodyId: number,
    planeId: number,
    numberOfChecks: number,
    bodyUpdateCallback: ((body: CmRigidbody) => void) | null,
  ): void {
    const plane = this.colliders[planeId];
    const moveBody = this.rigidbodies[bodyId];
    moveBody.isKinematic = false;
    moveBody.isOutOfCube = false;

    const deltaY = CmVector.multiply(plane.up, moveBody.collider.radius);
    let currentPoint = CmVector.add(plane.position, deltaY);
    let delta = CmVector.zero;
    let puted = false;
    let directionX = 1;
    let directionZ = 0;
    let andCheck = false;
    const displacement = numberOfChecks * 3 * moveBody.collider.radius;

    while (!puted && !andCheck) {
      currentPoint = CmVector.add(CmVector.add(delta, plane.position), deltaY);

      if (delta.x > displacement) {
        delta = CmVector.zero;
        directionX = -1;
      } else if (delta.x < -displacement) {
        delta = CmVector.zero;
        directionX = 0;
        directionZ = 1;
      } else if (delta.z > displacement) {
        delta = CmVector.zero;
        directionX = 0;
        directionZ = -1;
      } else if (delta.z < -displacement) {
        andCheck = true;
      }

      delta = CmVector.add(
        delta,
        CmVector.add(
          CmVector.multiply(plane.right, 3 * directionX * moveBody.collider.radius),
          CmVector.multiply(plane.forward, 3 * directionZ * moveBody.collider.radius),
        ),
      );

      const r = moveBody.collider.radius;
      const p0 = this._getOnePosition(currentPoint);
      const p1 = this._getOnePosition(CmVector.add(currentPoint, CmVector.multiply(plane.right,    r)));
      const p2 = this._getOnePosition(CmVector.add(currentPoint, CmVector.multiply(plane.right,   -r)));
      const p3 = this._getOnePosition(CmVector.add(currentPoint, CmVector.multiply(plane.forward,  r)));
      const p4 = this._getOnePosition(CmVector.add(currentPoint, CmVector.multiply(plane.forward, -r)));

      if (!this.dynamicSubspaces.has(spaceKey(p0)) &&
          !this.dynamicSubspaces.has(spaceKey(p1)) &&
          !this.dynamicSubspaces.has(spaceKey(p2)) &&
          !this.dynamicSubspaces.has(spaceKey(p3)) &&
          !this.dynamicSubspaces.has(spaceKey(p4))) {
        moveBody.collider.position = currentPoint;
        puted = true;
      }
    }

    if (!puted) {
      currentPoint = CmVector.add(plane.position, deltaY);
      moveBody.collider.position = currentPoint;
    }

    bodyUpdateCallback?.(moveBody);
  }
}
