/**
 * Collision manager — port of C# CmCollisionManager.
 *
 * All divisions use Math.trunc() to match C# long integer semantics.
 */

import type { Fixed } from './fixed-math';
import { fixAbs, fixClampMin } from './fixed-math';
import { CmVector } from './cm-vector';
import type { ICmCollider } from './colliders';

/** Space cube for broad-phase culling */
export interface CmSpaceCube {
  position: CmVector;
  scale: CmVector;
}

/** Collision manager static methods (matches C# CmCollisionManager) */
export class CmCollisionManager {
  /** Check if sphere overlaps a cubic subspace (matches C# SphereIsHitSubspace) */
  static sphereIsHitSubspace(centrePosition: CmVector, radiusPow: Fixed, scaleHalf: Fixed, position: CmVector): boolean {
    const x = fixClampMin(fixAbs(centrePosition.x - position.x) - scaleHalf, 0);
    const y = fixClampMin(fixAbs(centrePosition.y - position.y) - scaleHalf, 0);
    const z = fixClampMin(fixAbs(centrePosition.z - position.z) - scaleHalf, 0);
    return new CmVector(x, y, z).sqrMagnitude < radiusPow;
  }

  /** Check if collider is outside a space cube (matches C# IsOutOfSpaceCube) */
  static isOutOfSpaceCube(collider: ICmCollider, cube: CmSpaceCube): boolean {
    const x = fixClampMin(fixAbs(collider.position.x - cube.position.x) - Math.trunc(cube.scale.x / 2), 0);
    const y = fixClampMin(fixAbs(collider.position.y - cube.position.y) - Math.trunc(cube.scale.y / 2), 0);
    const z = fixClampMin(fixAbs(collider.position.z - cube.position.z) - Math.trunc(cube.scale.z / 2), 0);
    return new CmVector(x, y, z).sqrMagnitude > collider.radiusPow;
  }
}
