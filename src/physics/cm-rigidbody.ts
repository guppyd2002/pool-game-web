/**
 * CmRigidbody — port of C# CalculableMechanics/CmRigidbody.
 * Core physics simulation: forces, collisions, friction, deactivation.
 *
 * All divisions use Math.trunc() to match C# long integer semantics.
 */

import type { Fixed } from './fixed-math';
import { MULTIPLIER, fixMul, fixSqrtSave, fixPowSave, fixAbs } from './fixed-math';
import { CmVector } from './cm-vector';
import type { ICmCollider, CmHitInfo, CollisionResult } from './colliders';
import { CmSphereCollider, CmPlaneCollider, CmLineCollider } from './colliders';
import { CmCollisionManager } from './cm-collision';
import type { CmSpaceCube } from './cm-collision';

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Force application mode */
export enum CmForceMode {
  Force,
  Impulse,
}

/** Body movement type on plane (for friction model selection) */
export enum CmBodyMovingType {
  Rolling,
  Sliding,
  Twisting,
}

// ─── CmKinematicTrigger ──────────────────────────────────────────────────────

/** Trigger that converts dynamic objects to kinematic (matches C# CmKinematicTrigger) */
export class CmKinematicTrigger {
  id = 0;
  position = CmVector.zero;
  radius: Fixed = 0;

  private _radiusPow: Fixed = 0;
  get radiusPow(): Fixed {
    if (this._radiusPow === 0) this._radiusPow = fixPowSave(this.radius);
    return this._radiusPow;
  }

  /** Check if this trigger overlaps with a subspace */
  isHitSubspace(subspacesScale: Fixed, subspacesScalePow: Fixed, position: CmVector): boolean {
    return CmVector.sqrDistance(position, this.position) < fixPowSave(subspacesScale + this.radius);
  }
}

// ─── Re-export CmSpaceCube ───────────────────────────────────────────────────

export type { CmSpaceCube } from './cm-collision';

// ─── State types ─────────────────────────────────────────────────────────────

/** Rigidbody state for save/restore */
export interface CmRigidbodyState {
  isActive: boolean;
  isKinematic: boolean;
  isOutOfCube: boolean;
  kinematicTriggerId: number;
  position: CmVector;
  right: CmVector;
  up: CmVector;
  forward: CmVector;
  velocity: CmVector;
  angularVelocity: CmVector;
  firstHitDirection: CmVector;
}

/** Kinematic state for network sync */
export interface CmKinematicState {
  id: number;
  time: Fixed;
  isActive: boolean;
  position: CmVector;
  velocity: CmVector;
  angularVelocity: CmVector;
  isKinematic: boolean;
  kinematicTriggerId: number;
  isOutOfCube: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_SQR_VELOCITY: Fixed = 100;

// ─── CmRigidbody ─────────────────────────────────────────────────────────────

/** Core physics body (matches C# CmRigidbody) */
export class CmRigidbody {
  id = 0;
  instanceId = 0;
  mass: Fixed = MULTIPLIER;
  centreOfMass = CmVector.zero;
  velocity = CmVector.zero;
  angularVelocity = CmVector.zero;
  isKinematic = false;
  isOutOfCube = false;
  kinematicTriggerId = -1;
  collider!: ICmCollider;
  hitInfo: CmHitInfo = { isBody: false, point: CmVector.zero, normal: CmVector.zero, collider: null };
  firstHitDirection = CmVector.zero;
  hitColliders: number[] = [];
  hitBodies: number[] = [];

  // Callbacks
  onHit: ((velocity: CmVector, hitInfo: CmHitInfo) => void) | null = null;
  onMoving: ((velocity: CmVector, angularVelocity: CmVector, type: CmBodyMovingType) => void) | null = null;

  private _isActive = true;
  private checkCount = 0;

  get isActive(): boolean { return this._isActive; }
  set isActive(value: boolean) {
    if (value) {
      this.checkCount = 0;
      this._isActive = true;
    } else {
      this._isActive = false;
      this.velocity = CmVector.zero;
      this.angularVelocity = CmVector.zero;
    }
  }

  /** Mass-weighted position (centre of mass in world space) */
  get massPosition(): CmVector {
    const cm = this.centreOfMass;
    const c = this.collider;
    // position + (cm.x * right + cm.y * up + cm.z * forward) / MULTIPLIER
    return new CmVector(
      c.position.x + Math.trunc((cm.x * c.right.x + cm.y * c.up.x + cm.z * c.forward.x) / MULTIPLIER),
      c.position.y + Math.trunc((cm.x * c.right.y + cm.y * c.up.y + cm.z * c.forward.y) / MULTIPLIER),
      c.position.z + Math.trunc((cm.x * c.right.z + cm.y * c.up.z + cm.z * c.forward.z) / MULTIPLIER),
    );
  }

  /** Initialize/reset the rigidbody */
  init(): void {
    this._isActive = true;
    this.checkCount = 0;
    this.hitColliders = [];
    this.hitBodies = [];
    this.hitInfo = { isBody: false, point: CmVector.zero, normal: CmVector.zero, collider: null };
  }

  /** Add impulse/force to the body */
  addImpulse(force: CmVector, pos: CmVector, mode: CmForceMode, timestep: Fixed = 0): void {
    if (this.isKinematic || (force.x === 0 && force.y === 0 && force.z === 0)) return;
    this._isActive = true;

    // deltaVelocity = divide(force, mass) = (force * MULTIPLIER) / mass
    const deltaVelocity = CmVector.divide(force, this.mass);

    if (mode === CmForceMode.Impulse) {
      this.velocity = CmVector.add(this.velocity, deltaVelocity);
    } else {
      this.velocity = CmVector.add(this.velocity, CmVector.multiply(deltaVelocity, timestep));
    }

    // Torque from off-centre force
    const forceRadius = CmVector.sub(pos, this.massPosition);
    if (!(forceRadius.x === 0 && forceRadius.y === 0 && forceRadius.z === 0)) {
      const torque = CmVector.cross(new CmVector(-force.x, -force.y, -force.z), forceRadius);
      this.addTorque(torque, mode, timestep);
    }
  }

  /** Add torque to the body */
  addTorque(torque: CmVector, mode: CmForceMode, timestep: Fixed = 0): void {
    if (this.isKinematic || (torque.x === 0 && torque.y === 0 && torque.z === 0)) return;
    this._isActive = true;

    const moi = this.collider.getMomentOfInertia(this.centreOfMass, torque.normalized);
    // deltaAngVel = divide(divide(torque, mass), moi)
    const deltaAngVel = CmVector.divide(CmVector.divide(torque, this.mass), moi);

    if (mode === CmForceMode.Impulse) {
      this.angularVelocity = CmVector.add(this.angularVelocity, deltaAngVel);
    } else {
      this.angularVelocity = CmVector.add(this.angularVelocity, CmVector.multiply(deltaAngVel, timestep));
    }
  }

  /** Apply gravity and check if body should deactivate */
  moveAndCheckIsActive(timestep: Fixed): void {
    if (this.hitColliders.length === 0) {
      if (this._isActive) {
        // Apply gravity: velocity += multiply(gravity, timestep)
        this.velocity = CmVector.add(this.velocity, CmVector.multiply(CmVector.gravity, timestep));
      }
    } else {
      this._checkIsActive(2);
    }
    if (this.hitBodies.length > 0) {
      this._checkIsActive(2);
    }
  }

  /** Internal deactivation check */
  private _checkIsActive(cCount: number): void {
    if (!this._isActive) return;
    if (this.velocity.sqrMagnitude <= MIN_SQR_VELOCITY && this.angularVelocity.sqrMagnitude <= MIN_SQR_VELOCITY) {
      if (this.checkCount < cCount) {
        this.checkCount++;
      } else {
        this.checkCount = 0;
        this.isActive = false;
      }
    } else {
      this.checkCount = 0;
    }
  }

  /** Calculate body-body collision (matches C# CalculateHit for CmRigidbody) */
  calculateHitBody(timestep: Fixed, body2: CmRigidbody, beforeHit: () => void, afterHit: () => void): void {
    if (this.hitBodies.includes(body2.id)) return;

    const result = this.collider.isHit(body2.collider);
    if (!result.hit) return;
    const hitInfo = result.hitInfo;

    this.hitBodies.push(body2.id);
    body2.hitBodies.push(this.id);

    const mp = this.massPosition;
    const mp2 = body2.massPosition;
    // hitRelativeVelocity = vel1 - vel2 + cross(angVel1, hitPoint - mp1) - cross(angVel2, hitPoint - mp2)
    const hitRelVel = CmVector.add(
      CmVector.sub(this.velocity, body2.velocity),
      CmVector.sub(
        CmVector.cross(this.angularVelocity, CmVector.sub(hitInfo.point, mp)),
        CmVector.cross(body2.angularVelocity, CmVector.sub(hitInfo.point, mp2)),
      ),
    );

    if (CmVector.dot(hitRelVel, hitInfo.normal) >= 0) return;

    beforeHit();

    const bounciness = fixSqrtSave(fixMul(this.collider.material.bounciness, body2.collider.material.bounciness));
    const staticFriction = fixSqrtSave(fixMul(this.collider.material.staticFriction, body2.collider.material.staticFriction));

    const hitNormal = hitInfo.normal.normalized;
    const velocityT = CmVector.projectOnPlane(hitRelVel, hitNormal);
    const velocityTangents = velocityT.normalized;
    const velocityN = -CmVector.dot(hitRelVel, hitNormal);

    // vR = multiply(multiply(velocityTangents, -staticFriction) + hitNormal, -velocityN)
    const frictionTangent = CmVector.multiply(velocityTangents, -staticFriction);
    const direction = CmVector.add(frictionTangent, hitNormal);
    const vR = CmVector.multiply(direction, -velocityN);

    // Angular impulse
    const forceRadius = CmVector.sub(hitInfo.point, mp);
    const impulseForAngular = new CmVector(
      -Math.trunc((bounciness * vR.x) / MULTIPLIER),
      -Math.trunc((bounciness * vR.y) / MULTIPLIER),
      -Math.trunc((bounciness * vR.z) / MULTIPLIER),
    );
    const torque = CmVector.cross(new CmVector(-impulseForAngular.x, -impulseForAngular.y, -impulseForAngular.z), forceRadius);
    const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
    const angularImpulse = CmVector.divide(torque, moi);

    // Linear impulse: project(vel1 - vel2, hitNormal), negated
    const velDiffProj = CmVector.project(CmVector.sub(this.velocity, body2.velocity), hitNormal);
    const impulse = new CmVector(-velDiffProj.x, -velDiffProj.y, -velDiffProj.z);

    this.angularVelocity = CmVector.add(this.angularVelocity, angularImpulse);

    // Apply impulse with FirstHitDirection logic
    this._applyImpulseWithFirstHit(impulse);
    body2.angularVelocity = CmVector.sub(body2.angularVelocity, angularImpulse);
    body2._applyImpulseWithFirstHitReverse(impulse);

    body2.isActive = true;

    if (this.hitInfo.collider === null) {
      this.hitInfo = { isBody: true, point: hitInfo.point, normal: hitInfo.normal, collider: body2.collider };
    }
    if (body2.hitInfo.collider === null) {
      body2.hitInfo = { isBody: true, point: hitInfo.point, normal: new CmVector(-hitInfo.normal.x, -hitInfo.normal.y, -hitInfo.normal.z), collider: this.collider };
    }

    const velocityBefore = CmVector.sub(this.velocity, body2.velocity);
    this.onHit?.(velocityBefore, this.hitInfo);
    body2.onHit?.(velocityBefore, body2.hitInfo);
    afterHit();
  }

  /** Apply impulse with FirstHitDirection correction (add) */
  private _applyImpulseWithFirstHit(impulse: CmVector): void {
    if (!(this.firstHitDirection.x === 0 && this.firstHitDirection.y === 0 && this.firstHitDirection.z === 0)) {
      const impulse2 = CmVector.project(impulse, this.firstHitDirection);
      const dotCheck = Math.trunc((10 * CmVector.dot(impulse.normalized, impulse2.normalized)) / MULTIPLIER);
      if (dotCheck >= 9) {
        this.velocity = CmVector.add(this.velocity, impulse2);
      } else {
        this.velocity = CmVector.add(this.velocity, impulse);
      }
      this.firstHitDirection = CmVector.zero;
    } else {
      this.velocity = CmVector.add(this.velocity, impulse);
    }
  }

  /** Apply impulse with FirstHitDirection correction (subtract) */
  private _applyImpulseWithFirstHitReverse(impulse: CmVector): void {
    if (!(this.firstHitDirection.x === 0 && this.firstHitDirection.y === 0 && this.firstHitDirection.z === 0)) {
      const impulse2 = CmVector.project(impulse, this.firstHitDirection);
      const dotCheck = Math.trunc((10 * CmVector.dot(impulse.normalized, impulse2.normalized)) / MULTIPLIER);
      if (dotCheck >= 9) {
        this.velocity = CmVector.sub(this.velocity, impulse2);
      } else {
        this.velocity = CmVector.sub(this.velocity, impulse);
      }
      this.firstHitDirection = CmVector.zero;
    } else {
      this.velocity = CmVector.sub(this.velocity, impulse);
    }
  }

  /** Calculate collision with static collider (matches C# CalculateHit for ICmCollider) */
  calculateHitCollider(timestep: Fixed, collider2: ICmCollider, beforeHit: () => void, afterHit: () => void): void {
    if (this.hitColliders.includes(collider2.id)) return;

    const result = this.collider.isHit(collider2);
    if (!result.hit) return;
    const hitInfo = result.hitInfo;

    this.hitColliders.push(collider2.id);
    const mp = this.massPosition;
    const hitRadius = CmVector.sub(hitInfo.point, mp);
    const hitRelVel = CmVector.add(this.velocity, CmVector.cross(this.angularVelocity, hitRadius));

    if (collider2 instanceof CmPlaneCollider) {
      this._calculatePlaneHit(timestep, collider2, hitRelVel, hitInfo, hitRadius);
    } else if (CmVector.dot(this.velocity, hitInfo.normal) <= 0) {
      if (collider2 instanceof CmLineCollider) {
        beforeHit();
        this._calculateOtherColliderHit(mp, collider2, this.velocity, hitRelVel, hitInfo, hitRadius);
        if (this.hitInfo.collider === null) {
          this.hitInfo = { isBody: false, point: hitInfo.point, normal: hitInfo.normal, collider: collider2 };
        }
        this.onHit?.(this.velocity, this.hitInfo);
        afterHit();
      } else if (collider2 instanceof CmSphereCollider) {
        if (CmVector.dot(this.velocity, hitInfo.normal) < 0) {
          beforeHit();
          this._calculateSphereColliderHit(mp, this.velocity, hitInfo, collider2);
          if (this.hitInfo.collider === null) {
            this.hitInfo = { isBody: false, point: hitInfo.point, normal: hitInfo.normal, collider: collider2 };
          }
          this.onHit?.(this.velocity, this.hitInfo);
          afterHit();
        }
      }
    }
  }

  /** Sphere collider hit response */
  private _calculateSphereColliderHit(mp: CmVector, velocity: CmVector, hitInfo: CmHitInfo, sphereCollider2: CmSphereCollider): void {
    const bounciness = fixSqrtSave(fixMul(this.collider.material.bounciness, sphereCollider2.material.bounciness));
    const velocityN = -CmVector.dot(velocity, hitInfo.normal);
    const vR = CmVector.multiply(hitInfo.normal, -velocityN);

    const impulse = new CmVector(
      -Math.trunc((bounciness * vR.x) / MULTIPLIER),
      -Math.trunc((bounciness * vR.y) / MULTIPLIER),
      -Math.trunc((bounciness * vR.z) / MULTIPLIER),
    );
    this.velocity = CmVector.add(this.velocity, impulse);

    // Reposition out of collision
    this.collider.position = new CmVector(
      hitInfo.point.x + Math.trunc((this.collider.radius * hitInfo.normal.x) / MULTIPLIER),
      hitInfo.point.y + Math.trunc((this.collider.radius * hitInfo.normal.y) / MULTIPLIER),
      hitInfo.point.z + Math.trunc((this.collider.radius * hitInfo.normal.z) / MULTIPLIER),
    );

    // Angular from hit
    const forceRadius = CmVector.sub(hitInfo.point, mp);
    const torque = CmVector.cross(new CmVector(-impulse.x, -impulse.y, -impulse.z), forceRadius);
    const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
    const angularImpulse = CmVector.divide(torque, moi);
    this.angularVelocity = CmVector.add(this.angularVelocity, angularImpulse);
  }

  /** Line/other collider hit response */
  private _calculateOtherColliderHit(mp: CmVector, collider2: ICmCollider, velocity: CmVector, hitRelVel: CmVector, hitInfo: CmHitInfo, hitRadius: CmVector): void {
    const bounciness = fixSqrtSave(fixMul(this.collider.material.bounciness, collider2.material.bounciness));
    const velocityT = -CmVector.dot(hitRelVel, hitInfo.collider!.right);
    const velocityN = -CmVector.dot(hitRelVel, hitInfo.normal);

    const tFactor = velocityN === 0 ? 0 : Math.trunc((velocityT * MULTIPLIER) / velocityN);
    const staticFriction = fixSqrtSave(fixMul(this.collider.material.staticFriction, collider2.material.staticFriction));

    // direction = ((staticFriction * tFactor * collider.right) / (M*M) + hitInfo.Normal).Normalized
    const frictionVec = new CmVector(
      Math.trunc((staticFriction * tFactor * hitInfo.collider!.right.x) / (MULTIPLIER * MULTIPLIER)),
      Math.trunc((staticFriction * tFactor * hitInfo.collider!.right.y) / (MULTIPLIER * MULTIPLIER)),
      Math.trunc((staticFriction * tFactor * hitInfo.collider!.right.z) / (MULTIPLIER * MULTIPLIER)),
    );
    const direction = CmVector.add(frictionVec, hitInfo.normal).normalized;

    // vR = -(velocityN * direction) / MULTIPLIER
    const vR = new CmVector(
      -Math.trunc((velocityN * direction.x) / MULTIPLIER),
      -Math.trunc((velocityN * direction.y) / MULTIPLIER),
      -Math.trunc((velocityN * direction.z) / MULTIPLIER),
    );

    // impulse = -((bounciness + M) * vR) / M
    const bPlusM = bounciness + MULTIPLIER;
    let impulse = new CmVector(
      -Math.trunc((bPlusM * vR.x) / MULTIPLIER),
      -Math.trunc((bPlusM * vR.y) / MULTIPLIER),
      -Math.trunc((bPlusM * vR.z) / MULTIPLIER),
    );

    // ClampMin
    impulse = this._clampMin(impulse, -CmVector.dot(velocity, hitInfo.normal), hitInfo.normal);

    const torque = CmVector.cross(new CmVector(-impulse.x, -impulse.y, -impulse.z), hitRadius);
    const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
    // angularImpulse = (M * torque) / moi
    const angularImpulse = new CmVector(
      Math.trunc((MULTIPLIER * torque.x) / moi),
      Math.trunc((MULTIPLIER * torque.y) / moi),
      Math.trunc((MULTIPLIER * torque.z) / moi),
    );
    this.velocity = CmVector.add(this.velocity, impulse);
    this.angularVelocity = CmVector.add(this.angularVelocity, angularImpulse);
  }

  /** ClampMin helper (matches C# ClampMin / ClampMagnitude) */
  private _clampMin(vector: CmVector, min: Fixed, normal: CmVector): CmVector {
    const project = CmVector.project(vector, normal);
    const delta = CmVector.sub(vector, project);
    const minLen = Math.trunc((15 * min) / 10);
    const projMag = project.magnitude;
    if (projMag === 0) return vector;
    // C# ClampMagnitude unconditionally applies (clamp(mgn) * normalized) / M — even when no
    // clamping is needed. The normalize+scale cycle introduces fixed-point rounding that TS
    // must replicate exactly (e.g. 305527 → magnitude 305500 → rescaled -305500, not -305527).
    const clampedMag = projMag < fixAbs(minLen) ? fixAbs(minLen) : projMag;
    const clamped = CmVector.multiply(project.normalized, clampedMag);
    return CmVector.add(clamped, delta);
  }

  /** Plane collision response (matches C# CalculatePlaneColliderHit) */
  private _calculatePlaneHit(timestep: Fixed, planeCollider: ICmCollider, hitRelVel: CmVector, hitInfo: CmHitInfo, hitRadius: CmVector): void {
    const bounciness = fixSqrtSave(fixMul(this.collider.material.bounciness, planeCollider.material.bounciness));
    const velocityT = CmVector.projectOnPlane(hitRelVel, hitInfo.normal);
    const velocityTangents = velocityT.normalized;
    const velocityN = -CmVector.dot(hitRelVel, hitInfo.normal);
    const gravityN = -CmVector.dot(CmVector.gravity, hitInfo.normal);

    if ((bounciness + MULTIPLIER) * velocityN > gravityN * timestep) {
      // Bounce
      const staticFriction = fixSqrtSave(fixMul(this.collider.material.staticFriction, planeCollider.material.staticFriction));
      // vR = -(velocityN * ((-staticFriction * velocityTangents / M) + normal)) / M
      const frictionTangent = CmVector.multiply(velocityTangents, -staticFriction);
      const dir = CmVector.add(new CmVector(
        Math.trunc(frictionTangent.x / 1), // already divided by M in multiply
        Math.trunc(frictionTangent.y / 1),
        Math.trunc(frictionTangent.z / 1),
      ), hitInfo.normal);
      const vR = new CmVector(
        -Math.trunc((velocityN * dir.x) / MULTIPLIER),
        -Math.trunc((velocityN * dir.y) / MULTIPLIER),
        -Math.trunc((velocityN * dir.z) / MULTIPLIER),
      );
      // impulse = -((bounciness + M) * vR) / M
      const bPlusM = bounciness + MULTIPLIER;
      const impulse = new CmVector(
        -Math.trunc((bPlusM * vR.x) / MULTIPLIER),
        -Math.trunc((bPlusM * vR.y) / MULTIPLIER),
        -Math.trunc((bPlusM * vR.z) / MULTIPLIER),
      );
      // torque and angular impulse
      const torque = CmVector.cross(new CmVector(-impulse.x, -impulse.y, -impulse.z), hitRadius);
      const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
      const angularImpulse = new CmVector(
        Math.trunc((MULTIPLIER * torque.x) / moi),
        Math.trunc((MULTIPLIER * torque.y) / moi),
        Math.trunc((MULTIPLIER * torque.z) / moi),
      );
      this.velocity = CmVector.add(this.velocity, impulse);
      this.angularVelocity = CmVector.add(this.angularVelocity, angularImpulse);

      this.hitInfo = { isBody: false, point: hitInfo.point, normal: hitInfo.normal, collider: planeCollider };
      this.onHit?.(this.velocity, this.hitInfo);
    } else {
      // Rolling/Sliding/Twisting friction model
      this.velocity = CmVector.projectOnPlane(this.velocity, hitInfo.normal);
      const gravityT = CmVector.projectOnPlane(CmVector.gravity, hitInfo.normal);

      if (velocityT.sqrMagnitude > MIN_SQR_VELOCITY) {
        // Sliding
        const forceT = new CmVector(
          Math.trunc((-gravityN * velocityTangents.x) / MULTIPLIER),
          Math.trunc((-gravityN * velocityTangents.y) / MULTIPLIER),
          Math.trunc((-gravityN * velocityTangents.z) / MULTIPLIER),
        );
        const dynamicFriction = fixSqrtSave(fixMul(this.collider.material.dynamicFriction, planeCollider.material.dynamicFriction));
        const dynamicFrictionForce = CmVector.multiply(forceT, dynamicFriction);
        const deltaVelocity = CmVector.add(dynamicFrictionForce, gravityT);
        const torqueT = CmVector.cross(new CmVector(-dynamicFrictionForce.x, -dynamicFrictionForce.y, -dynamicFrictionForce.z), hitRadius);
        const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
        const deltaAngVel = new CmVector(
          Math.trunc((MULTIPLIER * torqueT.x) / moi),
          Math.trunc((MULTIPLIER * torqueT.y) / moi),
          Math.trunc((MULTIPLIER * torqueT.z) / moi),
        );

        if (!(dynamicFrictionForce.x === 0 && dynamicFrictionForce.y === 0 && dynamicFrictionForce.z === 0)) {
          // velocity += (timestep * deltaVelocity) / M
          this.velocity = CmVector.add(this.velocity, new CmVector(
            Math.trunc((timestep * deltaVelocity.x) / MULTIPLIER),
            Math.trunc((timestep * deltaVelocity.y) / MULTIPLIER),
            Math.trunc((timestep * deltaVelocity.z) / MULTIPLIER),
          ));
          this.angularVelocity = CmVector.add(this.angularVelocity, new CmVector(
            Math.trunc((timestep * deltaAngVel.x) / MULTIPLIER),
            Math.trunc((timestep * deltaAngVel.y) / MULTIPLIER),
            Math.trunc((timestep * deltaAngVel.z) / MULTIPLIER),
          ));
          this.onMoving?.(this.velocity, this.angularVelocity, CmBodyMovingType.Sliding);
        } else {
          // Rolling: velocity = -cross(angVel, hitRadius)
          const crossed = CmVector.cross(this.angularVelocity, hitRadius);
          this.velocity = new CmVector(-crossed.x, -crossed.y, -crossed.z);
          this.onMoving?.(this.velocity, this.angularVelocity, CmBodyMovingType.Rolling);
        }
      } else {
        // Low tangential velocity: rolling friction
        const forceT = new CmVector(
          Math.trunc((-gravityN * this.velocity.normalized.x) / MULTIPLIER),
          Math.trunc((-gravityN * this.velocity.normalized.y) / MULTIPLIER),
          Math.trunc((-gravityN * this.velocity.normalized.z) / MULTIPLIER),
        );
        const rollingFriction = this.collider.material.rollingFriction;
        const rollingFrictionForce = CmVector.multiply(forceT, rollingFriction);
        const deltaVelocity = CmVector.add(rollingFrictionForce, gravityT);
        const torqueT = CmVector.cross(new CmVector(-rollingFrictionForce.x, -rollingFrictionForce.y, -rollingFrictionForce.z), hitRadius);
        const moi = this.collider.getMomentOfInertia(this.centreOfMass, CmVector.zero);
        const deltaAngVel = new CmVector(
          Math.trunc((-MULTIPLIER * torqueT.x) / moi),
          Math.trunc((-MULTIPLIER * torqueT.y) / moi),
          Math.trunc((-MULTIPLIER * torqueT.z) / moi),
        );

        if (deltaVelocity.sqrMagnitude < this.velocity.sqrMagnitude) {
          this.angularVelocity = CmVector.add(this.angularVelocity, new CmVector(
            Math.trunc((timestep * deltaAngVel.x) / MULTIPLIER),
            Math.trunc((timestep * deltaAngVel.y) / MULTIPLIER),
            Math.trunc((timestep * deltaAngVel.z) / MULTIPLIER),
          ));
          const crossed = CmVector.cross(this.angularVelocity, hitRadius);
          this.velocity = new CmVector(-crossed.x, -crossed.y, -crossed.z);
          this.onMoving?.(this.velocity, this.angularVelocity, CmBodyMovingType.Rolling);
        } else {
          this.velocity = CmVector.zero;
          this.angularVelocity = CmVector.project(this.angularVelocity, hitInfo.normal);
          this.onMoving?.(this.velocity, this.angularVelocity, CmBodyMovingType.Twisting);
        }
      }

      // Twisting friction
      const twistingFriction = fixSqrtSave(fixMul(this.collider.material.twistingFriction, planeCollider.material.twistingFriction));
      const deltaTwisting = fixMul(twistingFriction, timestep);
      const twisting = CmVector.project(this.angularVelocity, hitInfo.normal);
      if (fixPowSave(deltaTwisting) <= twisting.sqrMagnitude) {
        this.angularVelocity = CmVector.sub(this.angularVelocity, new CmVector(
          Math.trunc((deltaTwisting * twisting.normalized.x) / MULTIPLIER),
          Math.trunc((deltaTwisting * twisting.normalized.y) / MULTIPLIER),
          Math.trunc((deltaTwisting * twisting.normalized.z) / MULTIPLIER),
        ));
      } else {
        this.angularVelocity = CmVector.projectOnPlane(this.angularVelocity, hitInfo.normal);
      }
    }

    // Reposition sphere on plane surface
    this.collider.position = new CmVector(
      hitInfo.point.x + Math.trunc((this.collider.radius * hitInfo.normal.x) / MULTIPLIER),
      hitInfo.point.y + Math.trunc((this.collider.radius * hitInfo.normal.y) / MULTIPLIER),
      hitInfo.point.z + Math.trunc((this.collider.radius * hitInfo.normal.z) / MULTIPLIER),
    );
  }

  /** Check if sphere hits a kinematic trigger */
  calculateHitTrigger(trigger: CmKinematicTrigger): void {
    if (this.isKinematic) return;
    // Check sphere-trigger overlap
    const sqrDist = CmVector.sqrDistance(this.collider.position, trigger.position);
    if (sqrDist <= fixPowSave(this.collider.radius + trigger.radius)) {
      this.isKinematic = true;
      this.isActive = false;
      this.kinematicTriggerId = trigger.id;
    }
  }

  /** Check if body has left the space cube */
  calculateOutOfCube(spaceCube: CmSpaceCube): void {
    if (!this.isOutOfCube && CmCollisionManager.isOutOfSpaceCube(this.collider, spaceCube)) {
      this.isOutOfCube = true;
      this.isActive = false;
    }
  }

  /** Set state from saved state object */
  setState(state: CmRigidbodyState): void {
    this.isActive = state.isActive;
    this.isKinematic = state.isKinematic;
    this.kinematicTriggerId = state.kinematicTriggerId;
    this.isOutOfCube = state.isOutOfCube;
    this.collider.position = state.position;
    this.collider.right = state.right;
    this.collider.up = state.up;
    this.collider.forward = state.forward;
    this.velocity = state.velocity;
    this.angularVelocity = state.angularVelocity;
    this.firstHitDirection = state.firstHitDirection;
  }

  /** Export kinematic state for network sync */
  toKinematicState(time: Fixed): CmKinematicState {
    return {
      id: this.id,
      time,
      isActive: this._isActive,
      position: this.collider.position,
      velocity: this.velocity,
      angularVelocity: this.angularVelocity,
      isKinematic: this.isKinematic,
      kinematicTriggerId: this.kinematicTriggerId,
      isOutOfCube: this.isOutOfCube,
    };
  }
}
