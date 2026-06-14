/**
 * CmSimpleVector + CmVector — TypeScript port of C# CalculableMechanics.
 *
 * All values are Fixed (integers scaled by MULTIPLIER = 10000).
 * CRITICAL: All divisions use Math.trunc() to match C# long division.
 */

import { Fixed, MULTIPLIER, fixSqrtSave, fixAbs } from './fixed-math';

// ─── CmSimpleVector ──────────────────────────────────────────────────────────

/** Simple 3D vector (matches C# CmSimpleVector struct) */
export class CmSimpleVector {
  constructor(
    public x: Fixed = 0,
    public y: Fixed = 0,
    public z: Fixed = 0,
  ) {}

  /** (x² + y² + z²) / MULTIPLIER */
  get sqrMagnitude(): Fixed {
    return Math.trunc((this.x * this.x + this.y * this.y + this.z * this.z) / MULTIPLIER);
  }

  // ─── Static constants (unscaled unit values, matches C# lowercase) ───
  static readonly zero = new CmSimpleVector(0, 0, 0);
  static readonly one = new CmSimpleVector(1, 1, 1);
  static readonly right = new CmSimpleVector(1, 0, 0);
  static readonly left = new CmSimpleVector(-1, 0, 0);
  static readonly up = new CmSimpleVector(0, 1, 0);
  static readonly down = new CmSimpleVector(0, -1, 0);
  static readonly forward = new CmSimpleVector(0, 0, 1);
  static readonly back = new CmSimpleVector(0, 0, -1);

  // Scaled constants (matches C# uppercase)
  static readonly One = new CmSimpleVector(MULTIPLIER, MULTIPLIER, MULTIPLIER);
  static readonly Right = new CmSimpleVector(MULTIPLIER, 0, 0);
  static readonly Left = new CmSimpleVector(-MULTIPLIER, 0, 0);
  static readonly Up = new CmSimpleVector(0, MULTIPLIER, 0);
  static readonly Down = new CmSimpleVector(0, -MULTIPLIER, 0);
  static readonly Forward = new CmSimpleVector(0, 0, MULTIPLIER);
  static readonly Back = new CmSimpleVector(0, 0, -MULTIPLIER);

  /** Serialize to compact string (matches C# ToString exactly) */
  toString(): string {
    const { x, y, z } = this;
    if (x === 0 && y === 0 && z === 0) return 'z';
    if (x === 1 && y === 0 && z === 0) return 'r';
    if (x === 0 && y === 1 && z === 0) return 'u';
    if (x === 0 && y === 0 && z === 1) return 'f';
    if (x === -1 && y === 0 && z === 0) return 'l';
    if (x === 0 && y === -1 && z === 0) return 'd';
    if (x === 0 && y === 0 && z === -1) return 'b';
    if (x === 1 && y === 1 && z === 1) return 'o';
    if (x === MULTIPLIER && y === 0 && z === 0) return 'R';
    if (x === 0 && y === MULTIPLIER && z === 0) return 'U';
    if (x === 0 && y === 0 && z === MULTIPLIER) return 'F';
    if (x === -MULTIPLIER && y === 0 && z === 0) return 'L';
    if (x === 0 && y === -MULTIPLIER && z === 0) return 'D';
    if (x === 0 && y === 0 && z === -MULTIPLIER) return 'B';
    if (x === MULTIPLIER && y === MULTIPLIER && z === MULTIPLIER) return 'O';
    return `(${x}, ${y}, ${z})`;
  }

  /** Deserialize from string (matches C# FromString exactly) */
  static fromString(s: string): CmSimpleVector {
    if (s === '' || s === 'z') return CmSimpleVector.zero;
    switch (s) {
      case 'r': return CmSimpleVector.right;
      case 'u': return CmSimpleVector.up;
      case 'f': return CmSimpleVector.forward;
      case 'l': return CmSimpleVector.left;
      case 'd': return CmSimpleVector.down;
      case 'b': return CmSimpleVector.back;
      case 'o': return CmSimpleVector.one;
      case 'R': return CmSimpleVector.Right;
      case 'U': return CmSimpleVector.Up;
      case 'F': return CmSimpleVector.Forward;
      case 'L': return CmSimpleVector.Left;
      case 'D': return CmSimpleVector.Down;
      case 'B': return CmSimpleVector.Back;
      case 'O': return CmSimpleVector.One;
    }

    // Parse "(x, y, z)" format
    let strX = '', strY = '', strZ = '';
    let step = 1;
    for (const c of s) {
      if (c === ',') { step++; continue; }
      if (c === '(' || c === ' ' || c === ')') continue;
      switch (step) {
        case 1: strX += c; break;
        case 2: strY += c; break;
        case 3: strZ += c; break;
      }
    }
    return new CmSimpleVector(
      parseInt(strX, 10) || 0,
      parseInt(strY, 10) || 0,
      parseInt(strZ, 10) || 0,
    );
  }
}

// ─── CmVector ────────────────────────────────────────────────────────────────

/** Full 3D vector with math operations (matches C# CmVector struct) */
export class CmVector {
  constructor(
    public x: Fixed = 0,
    public y: Fixed = 0,
    public z: Fixed = 0,
  ) {}

  // ─── Static constants ───────────────────────────────────────────────
  static readonly zero = new CmVector(0, 0, 0);
  static readonly one = new CmVector(1, 1, 1);
  static readonly right = new CmVector(1, 0, 0);
  static readonly left = new CmVector(-1, 0, 0);
  static readonly up = new CmVector(0, 1, 0);
  static readonly down = new CmVector(0, -1, 0);
  static readonly forward = new CmVector(0, 0, 1);
  static readonly back = new CmVector(0, 0, -1);

  static readonly One = new CmVector(MULTIPLIER, MULTIPLIER, MULTIPLIER);
  static readonly Right = new CmVector(MULTIPLIER, 0, 0);
  static readonly Left = new CmVector(-MULTIPLIER, 0, 0);
  static readonly Up = new CmVector(0, MULTIPLIER, 0);
  static readonly Down = new CmVector(0, -MULTIPLIER, 0);
  static readonly Forward = new CmVector(0, 0, MULTIPLIER);
  static readonly Back = new CmVector(0, 0, -MULTIPLIER);

  /** Gravity constant: (0, -98100, 0) — matches C# */
  static readonly gravity = new CmVector(0, -98100, 0);

  // ─── Instance properties ────────────────────────────────────────────

  /** (x² + y² + z²) / MULTIPLIER */
  get sqrMagnitude(): Fixed {
    return Math.trunc((this.x * this.x + this.y * this.y + this.z * this.z) / MULTIPLIER);
  }

  /** sqrt(sqrMagnitude) */
  get magnitude(): Fixed {
    return fixSqrtSave(this.sqrMagnitude);
  }

  /** Unit vector (scaled to MULTIPLIER length) */
  get normalized(): CmVector {
    const mgn = this.magnitude;
    if (mgn === 0) return CmVector.zero;
    return new CmVector(
      Math.trunc((this.x * MULTIPLIER) / mgn),
      Math.trunc((this.y * MULTIPLIER) / mgn),
      Math.trunc((this.z * MULTIPLIER) / mgn),
    );
  }

  // ─── Static math operations ─────────────────────────────────────────

  /** Component-wise add */
  static add(a: CmVector, b: CmVector): CmVector {
    return new CmVector(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  /** Component-wise subtract */
  static sub(a: CmVector, b: CmVector): CmVector {
    return new CmVector(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  /** Scale by integer (no fixed-point division) */
  static scale(v: CmVector, i: Fixed): CmVector {
    return new CmVector(v.x * i, v.y * i, v.z * i);
  }

  /** Fixed-point multiply: (v * i) / MULTIPLIER per component */
  static multiply(v: CmVector, i: Fixed): CmVector {
    return new CmVector(
      Math.trunc((i * v.x) / MULTIPLIER),
      Math.trunc((i * v.y) / MULTIPLIER),
      Math.trunc((i * v.z) / MULTIPLIER),
    );
  }

  /** Fixed-point divide: (v * MULTIPLIER) / i per component */
  static divide(v: CmVector, i: Fixed): CmVector {
    return new CmVector(
      Math.trunc((v.x * MULTIPLIER) / i),
      Math.trunc((v.y * MULTIPLIER) / i),
      Math.trunc((v.z * MULTIPLIER) / i),
    );
  }

  /** Dot product: (a·b) / MULTIPLIER */
  static dot(a: CmVector, b: CmVector): Fixed {
    return Math.trunc((a.x * b.x + a.y * b.y + a.z * b.z) / MULTIPLIER);
  }

  /** Cross product: components divided by MULTIPLIER */
  static cross(lhs: CmVector, rhs: CmVector): CmVector {
    if ((lhs.x === 0 && lhs.y === 0 && lhs.z === 0) ||
        (rhs.x === 0 && rhs.y === 0 && rhs.z === 0)) {
      return CmVector.zero;
    }
    return new CmVector(
      Math.trunc((lhs.y * rhs.z - rhs.y * lhs.z) / MULTIPLIER),
      Math.trunc((-lhs.x * rhs.z + rhs.x * lhs.z) / MULTIPLIER),
      Math.trunc((lhs.x * rhs.y - rhs.x * lhs.y) / MULTIPLIER),
    );
  }

  /** Project vector onto vectorNormal */
  static project(vector: CmVector, vectorNormal: CmVector): CmVector {
    if (vector.x === 0 && vector.y === 0 && vector.z === 0) return CmVector.zero;
    const d = CmVector.dot(vector, vectorNormal);
    return new CmVector(
      Math.trunc((d * vectorNormal.x) / MULTIPLIER),
      Math.trunc((d * vectorNormal.y) / MULTIPLIER),
      Math.trunc((d * vectorNormal.z) / MULTIPLIER),
    );
  }

  /** Project vector onto plane defined by planeNormal */
  static projectOnPlane(vector: CmVector, planeNormal: CmVector): CmVector {
    if (vector.x === 0 && vector.y === 0 && vector.z === 0) return CmVector.zero;
    const proj = CmVector.project(vector, planeNormal);
    return new CmVector(
      vector.x - proj.x,
      vector.y - proj.y,
      vector.z - proj.z,
    );
  }

  /** Max absolute component difference between two vectors */
  static maxXYZ(a: CmVector, b: CmVector): Fixed {
    const dx = fixAbs(a.x - b.x);
    const dy = fixAbs(a.y - b.y);
    const dz = fixAbs(a.z - b.z);
    return Math.max(dx, dy, dz);
  }

  // ─── Conversion / serialization ─────────────────────────────────────

  /** Convert to CmSimpleVector */
  toCmSimpleVector(): CmSimpleVector {
    return new CmSimpleVector(this.x, this.y, this.z);
  }

  /** Serialize via CmSimpleVector.toString() */
  toString(): string {
    return this.toCmSimpleVector().toString();
  }

  /** Deserialize from string (delegates to CmSimpleVector.fromString) */
  static fromString(s: string): CmVector {
    const sv = CmSimpleVector.fromString(s);
    return new CmVector(sv.x, sv.y, sv.z);
  }

  /** Value equality */
  equals(other: CmVector): boolean {
    return this.x === other.x && this.y === other.y && this.z === other.z;
  }
}
