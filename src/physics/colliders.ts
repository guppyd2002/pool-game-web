/**
 * Collider types — port of C# ICmCollider, CmSphereCollider, CmPlaneCollider, CmLineCollider.
 *
 * All divisions use Math.trunc() to match C# long integer semantics.
 */

import { Fixed, MULTIPLIER, fixAbs, fixPowSave } from './fixed-math';
import { CmVector } from './cm-vector';

// ─── Data Structures ─────────────────────────────────────────────────────────

/** Hit information from collision detection */
export interface CmHitInfo {
  isBody: boolean;
  point: CmVector;
  normal: CmVector;
  collider: ICmCollider | null;
}

/** Physics material properties */
export interface CmMaterial {
  bounciness: Fixed;
  rollingFriction: Fixed;
  twistingFriction: Fixed;
  dynamicFriction: Fixed;
  staticFriction: Fixed;
}

/** Collision result */
export interface CollisionResult {
  hit: boolean;
  hitInfo: CmHitInfo;
}

// ─── ICmCollider Interface ───────────────────────────────────────────────────

/** Physical shape interface (matches C# ICmCollider) */
export interface ICmCollider {
  enabled: boolean;
  id: number;
  instanceId: number;
  position: CmVector;
  right: CmVector;
  up: CmVector;
  forward: CmVector;
  scale: CmVector;
  radius: Fixed;
  readonly radiusPow: Fixed;
  momentOfInertia: Fixed;
  material: CmMaterial;
  getMomentOfInertia(centreOfMass: CmVector, axis: CmVector): Fixed;
  isHit(other: ICmCollider): CollisionResult;
  isHitSphere(point: CmVector, radius: Fixed): CollisionResult;
  isHitSubspace(subspacesScale: Fixed, subspacesScalePow: Fixed, position: CmVector): boolean;
  getSubspaceScale(): CmVector;
}

// ─── Empty hit info helper ───────────────────────────────────────────────────

const EMPTY_HIT: CmHitInfo = { isBody: false, point: CmVector.zero, normal: CmVector.zero, collider: null };

// ─── CmSphereCollider ────────────────────────────────────────────────────────

/** Sphere collider (matches C# CmSphereCollider) */
export class CmSphereCollider implements ICmCollider {
  enabled = true;
  id = 0;
  instanceId = 0;
  position = CmVector.zero;
  right = new CmVector(MULTIPLIER, 0, 0);
  up = new CmVector(0, MULTIPLIER, 0);
  forward = new CmVector(0, 0, MULTIPLIER);
  scale = CmVector.zero;
  radius: Fixed = 0;
  momentOfInertia: Fixed = 0;
  material: CmMaterial = { bounciness: 0, rollingFriction: 0, twistingFriction: 0, dynamicFriction: 0, staticFriction: 0 };

  private _radiusPow: Fixed = 0;
  get radiusPow(): Fixed {
    if (this._radiusPow === 0) this._radiusPow = fixPowSave(this.radius);
    return this._radiusPow;
  }

  getMomentOfInertia(_centreOfMass: CmVector, _axis: CmVector): Fixed {
    if (this.momentOfInertia === 0) {
      this.momentOfInertia = Math.trunc((2 * this.radiusPow) / 5);
    }
    return this.momentOfInertia;
  }

  isHit(other: ICmCollider): CollisionResult {
    if (other instanceof CmSphereCollider) {
      return isHitSphereSphere(this, other);
    } else if (other instanceof CmLineCollider) {
      return isHitSphereLine(this, other);
    } else if (other instanceof CmPlaneCollider) {
      return isHitSpherePlane(this, other);
    }
    return { hit: false, hitInfo: EMPTY_HIT };
  }

  isHitSphere(point: CmVector, radius: Fixed): CollisionResult {
    if (!this.enabled) return { hit: false, hitInfo: EMPTY_HIT };
    return isHitSpherePoint(this, point, radius);
  }

  isHitSubspace(subspacesScale: Fixed, subspacesScalePow: Fixed, pos: CmVector): boolean {
    return CmVector.sqrDistance(pos, this.position) < fixPowSave(subspacesScale + this.radius);
  }

  getSubspaceScale(): CmVector {
    return this.scale;
  }
}

// ─── CmPlaneCollider ─────────────────────────────────────────────────────────

/** Plane collider (matches C# CmPlaneCollider) */
export class CmPlaneCollider implements ICmCollider {
  enabled = true;
  id = 0;
  instanceId = 0;
  position = CmVector.zero;
  right = new CmVector(MULTIPLIER, 0, 0);
  up = new CmVector(0, MULTIPLIER, 0);
  forward = new CmVector(0, 0, MULTIPLIER);
  scale = CmVector.zero;
  radius: Fixed = 0;
  momentOfInertia: Fixed = 0;
  material: CmMaterial = { bounciness: 0, rollingFriction: 0, twistingFriction: 0, dynamicFriction: 0, staticFriction: 0 };

  private _radiusPow: Fixed = 0;
  get radiusPow(): Fixed {
    if (this._radiusPow === 0) this._radiusPow = fixPowSave(this.radius);
    return this._radiusPow;
  }

  getMomentOfInertia(_centreOfMass: CmVector, _axis: CmVector): Fixed {
    if (this.momentOfInertia === 0) {
      this.momentOfInertia = Math.trunc((2 * this.radiusPow) / 5);
    }
    return this.momentOfInertia;
  }

  isHit(_other: ICmCollider): CollisionResult {
    return { hit: false, hitInfo: EMPTY_HIT };
  }

  isHitSphere(_point: CmVector, _radius: Fixed): CollisionResult {
    return { hit: false, hitInfo: EMPTY_HIT };
  }

  isHitSubspace(subspacesScale: Fixed, subspacesScalePow: Fixed, pos: CmVector): boolean {
    const planePoint = CmVector.projectPointOnPlane(pos, this.position, this.up);
    return CmVector.sqrDistance(pos, planePoint) < subspacesScalePow;
  }

  getSubspaceScale(): CmVector {
    // MaxAbs of the 4 corner vectors
    const v1x = Math.trunc((this.scale.x * this.right.x + this.scale.z * this.forward.x) / MULTIPLIER);
    const v1y = Math.trunc((this.scale.x * this.right.y + this.scale.z * this.forward.y) / MULTIPLIER);
    const v1z = Math.trunc((this.scale.x * this.right.z + this.scale.z * this.forward.z) / MULTIPLIER);
    return new CmVector(fixAbs(v1x), fixAbs(v1y), fixAbs(v1z));
  }
}

// ─── CmLineCollider ──────────────────────────────────────────────────────────

/** Line collider (matches C# CmLineCollider) */
export class CmLineCollider implements ICmCollider {
  enabled = true;
  id = 0;
  instanceId = 0;
  position = CmVector.zero;
  right = new CmVector(MULTIPLIER, 0, 0);
  up = new CmVector(0, MULTIPLIER, 0);
  forward = new CmVector(0, 0, MULTIPLIER);
  scale = CmVector.zero;
  radius: Fixed = 0;
  momentOfInertia: Fixed = 0;
  material: CmMaterial = { bounciness: 0, rollingFriction: 0, twistingFriction: 0, dynamicFriction: 0, staticFriction: 0 };

  private _radiusPow: Fixed = 0;
  get radiusPow(): Fixed {
    if (this._radiusPow === 0) this._radiusPow = fixPowSave(this.radius);
    return this._radiusPow;
  }

  private _scalexPow: Fixed = 0;
  get scalexPow(): Fixed {
    if (this._scalexPow === 0) this._scalexPow = fixPowSave(this.scale.x);
    return this._scalexPow;
  }

  getMomentOfInertia(_centreOfMass: CmVector, _axis: CmVector): Fixed {
    if (this.momentOfInertia === 0) {
      this.momentOfInertia = Math.trunc((2 * this.radiusPow) / 5);
    }
    return this.momentOfInertia;
  }

  isHit(_other: ICmCollider): CollisionResult {
    return { hit: false, hitInfo: EMPTY_HIT };
  }

  isHitSphere(point: CmVector, radius: Fixed): CollisionResult {
    if (!this.enabled) return { hit: false, hitInfo: EMPTY_HIT };
    return isHitSphereLinePoint(point, fixPowSave(radius), this);
  }

  isHitSubspace(subspacesScale: Fixed, subspacesScalePow: Fixed, pos: CmVector): boolean {
    const axisPoint = CmVector.projectPointOnAxis(pos, this.position, this.right);
    return CmVector.sqrDistance(pos, axisPoint) < subspacesScalePow;
  }

  getSubspaceScale(): CmVector {
    // Project right onto world axes, scale by scale.x
    const vx = CmVector.dot(this.right, CmVector.scale(CmVector.right, MULTIPLIER));
    const vy = CmVector.dot(this.right, CmVector.scale(CmVector.up, MULTIPLIER));
    const vz = CmVector.dot(this.right, CmVector.scale(CmVector.forward, MULTIPLIER));
    const vec = CmVector.abs(new CmVector(vx, vy, vz));
    return CmVector.multiply(vec, this.scale.x);
  }
}

// ─── Collision detection functions ───────────────────────────────────────────

/** Sphere vs Sphere collision (matches C# CmCollisionManager.IsHit) */
function isHitSphereSphere(s1: CmSphereCollider, s2: CmSphereCollider): CollisionResult {
  const sqrDist = CmVector.sqrDistance(s1.position, s2.position);
  if (sqrDist <= fixPowSave(s1.radius + s2.radius)) {
    const totalR = s1.radius + s2.radius;
    const point = new CmVector(
      Math.trunc((s1.position.x * s2.radius + s2.position.x * s1.radius) / totalR),
      Math.trunc((s1.position.y * s2.radius + s2.position.y * s1.radius) / totalR),
      Math.trunc((s1.position.z * s2.radius + s2.position.z * s1.radius) / totalR),
    );
    const normal = CmVector.sub(s1.position, s2.position).normalized;
    return { hit: true, hitInfo: { isBody: false, point, normal, collider: s2 } };
  }
  return { hit: false, hitInfo: EMPTY_HIT };
}

/** Sphere vs Plane collision (matches C# CmCollisionManager.IsHit sphere+plane) */
function isHitSpherePlane(sphere: CmSphereCollider, plane: CmPlaneCollider): CollisionResult {
  const planePoint = CmVector.projectPointOnPlane(sphere.position, plane.position, plane.up);
  const hitInfo: CmHitInfo = { isBody: false, point: planePoint, normal: plane.up, collider: plane };
  const hit = CmVector.sqrDistance(sphere.position, planePoint) <= sphere.radiusPow;
  return { hit, hitInfo };
}

/** Sphere vs Line collision (matches C# CmCollisionManager.IsHit sphere+line) */
function isHitSphereLine(sphere: CmSphereCollider, line: CmLineCollider): CollisionResult {
  const axisPoint = CmVector.projectPointOnAxis(sphere.position, line.position, line.right);
  const hitInfo: CmHitInfo = { isBody: false, point: axisPoint, normal: line.forward, collider: line };

  const sphereAxisSqrDist = CmVector.sqrDistance(sphere.position, axisPoint);
  if (sphereAxisSqrDist <= sphere.radiusPow) {
    const scaleXHalf = Math.trunc(line.scale.x / 2);
    // Check if within line segment bounds
    const endA = new CmVector(
      Math.trunc((line.right.x * scaleXHalf) / MULTIPLIER) + line.position.x,
      Math.trunc((line.right.y * scaleXHalf) / MULTIPLIER) + line.position.y,
      Math.trunc((line.right.z * scaleXHalf) / MULTIPLIER) + line.position.z,
    );
    const endB = new CmVector(
      line.position.x - Math.trunc((line.right.x * scaleXHalf) / MULTIPLIER),
      line.position.y - Math.trunc((line.right.y * scaleXHalf) / MULTIPLIER),
      line.position.z - Math.trunc((line.right.z * scaleXHalf) / MULTIPLIER),
    );
    const hit = CmVector.sqrDistance(sphere.position, endA) <= sphere.radiusPow
      || CmVector.sqrDistance(sphere.position, endB) <= sphere.radiusPow
      || CmVector.sqrDistance(line.position, axisPoint) <= Math.trunc(line.scalexPow / 4);
    return { hit, hitInfo };
  }
  return { hit: false, hitInfo };
}

/** Sphere point hit test (matches C# CmCollisionManager.IsHitSphere for sphere) */
function isHitSpherePoint(sphere: CmSphereCollider, point: CmVector, radius: Fixed): CollisionResult {
  const sqrDist = CmVector.sqrDistance(sphere.position, point);
  if (sqrDist <= fixPowSave(sphere.radius + radius)) {
    const totalR = sphere.radius + radius;
    const hitPoint = new CmVector(
      Math.trunc((sphere.position.x * radius + point.x * sphere.radius) / totalR),
      Math.trunc((sphere.position.y * radius + point.y * sphere.radius) / totalR),
      Math.trunc((sphere.position.z * radius + point.z * sphere.radius) / totalR),
    );
    const normal = CmVector.sub(point, sphere.position).normalized;
    return { hit: true, hitInfo: { isBody: false, point: hitPoint, normal, collider: sphere } };
  }
  return { hit: false, hitInfo: EMPTY_HIT };
}

/** Line point hit test (matches C# CmCollisionManager.IsHitSphere for line) */
function isHitSphereLinePoint(point: CmVector, radiusPow: Fixed, line: CmLineCollider): CollisionResult {
  const axisPoint = CmVector.projectPointOnAxis(point, line.position, line.right);
  const hitInfo: CmHitInfo = { isBody: false, point: axisPoint, normal: line.forward, collider: line };

  const sphereAxisSqrDist = CmVector.sqrDistance(point, axisPoint);
  if (sphereAxisSqrDist <= radiusPow) {
    const scaleXHalf = Math.trunc(line.scale.x / 2);
    const endA = new CmVector(
      Math.trunc((line.right.x * scaleXHalf) / MULTIPLIER) + line.position.x,
      Math.trunc((line.right.y * scaleXHalf) / MULTIPLIER) + line.position.y,
      Math.trunc((line.right.z * scaleXHalf) / MULTIPLIER) + line.position.z,
    );
    const endB = new CmVector(
      line.position.x - Math.trunc((line.right.x * scaleXHalf) / MULTIPLIER),
      line.position.y - Math.trunc((line.right.y * scaleXHalf) / MULTIPLIER),
      line.position.z - Math.trunc((line.right.z * scaleXHalf) / MULTIPLIER),
    );
    const hit = CmVector.sqrDistance(point, endA) <= radiusPow
      || CmVector.sqrDistance(point, endB) <= radiusPow
      || CmVector.sqrDistance(line.position, axisPoint) <= Math.trunc(line.scalexPow / 4);
    return { hit, hitInfo };
  }
  return { hit: false, hitInfo };
}
