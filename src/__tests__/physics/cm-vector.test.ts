/**
 * Tests for CmVector and CmSimpleVector — port of C# CalculableMechanics.
 * TDD red phase: these tests define the expected behavior.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector, CmSimpleVector } from '../../physics/cm-vector';

// ─── CmSimpleVector ──────────────────────────────────────────────────────────

describe('CmSimpleVector', () => {
  describe('sqrMagnitude', () => {
    it('returns 0 for zero vector', () => {
      expect(CmSimpleVector.zero.sqrMagnitude).toBe(0);
    });

    it('computes (x²+y²+z²)/MULTIPLIER', () => {
      const v = new CmSimpleVector(10000, 0, 0);
      // (10000² + 0 + 0) / 10000 = 10000
      expect(v.sqrMagnitude).toBe(10000);
    });
  });

  describe('serialization round-trip', () => {
    const cases: Array<{ letter: string; vec: () => CmSimpleVector }> = [
      { letter: 'z', vec: () => CmSimpleVector.zero },
      { letter: 'r', vec: () => CmSimpleVector.right },
      { letter: 'u', vec: () => CmSimpleVector.up },
      { letter: 'f', vec: () => CmSimpleVector.forward },
      { letter: 'l', vec: () => CmSimpleVector.left },
      { letter: 'd', vec: () => CmSimpleVector.down },
      { letter: 'b', vec: () => CmSimpleVector.back },
      { letter: 'o', vec: () => CmSimpleVector.one },
      { letter: 'R', vec: () => CmSimpleVector.Right },
      { letter: 'U', vec: () => CmSimpleVector.Up },
      { letter: 'F', vec: () => CmSimpleVector.Forward },
      { letter: 'L', vec: () => CmSimpleVector.Left },
      { letter: 'D', vec: () => CmSimpleVector.Down },
      { letter: 'B', vec: () => CmSimpleVector.Back },
      { letter: 'O', vec: () => CmSimpleVector.One },
    ];

    for (const { letter, vec } of cases) {
      it(`"${letter}" round-trips`, () => {
        const v = vec();
        expect(v.toString()).toBe(letter);
        const parsed = CmSimpleVector.fromString(letter);
        expect(parsed.x).toBe(v.x);
        expect(parsed.y).toBe(v.y);
        expect(parsed.z).toBe(v.z);
      });
    }

    it('parses "(12345, -6789, 0)"', () => {
      const v = CmSimpleVector.fromString('(12345, -6789, 0)');
      expect(v.x).toBe(12345);
      expect(v.y).toBe(-6789);
      expect(v.z).toBe(0);
    });

    it('generic format round-trips', () => {
      const v = new CmSimpleVector(12345, -6789, 42);
      const s = v.toString();
      const parsed = CmSimpleVector.fromString(s);
      expect(parsed.x).toBe(v.x);
      expect(parsed.y).toBe(v.y);
      expect(parsed.z).toBe(v.z);
    });
  });
});

// ─── CmVector ────────────────────────────────────────────────────────────────

describe('CmVector', () => {
  describe('dot', () => {
    it('perpendicular vectors → 0', () => {
      expect(CmVector.dot(
        new CmVector(10000, 0, 0),
        new CmVector(0, 10000, 0),
      )).toBe(0);
    });

    it('parallel same direction', () => {
      // dot([10000,0,0],[10000,0,0]) = 10000*10000/10000 = 10000
      expect(CmVector.dot(
        new CmVector(10000, 0, 0),
        new CmVector(10000, 0, 0),
      )).toBe(10000);
    });
  });

  describe('cross', () => {
    it('x cross y = z', () => {
      const result = CmVector.cross(
        new CmVector(10000, 0, 0),
        new CmVector(0, 10000, 0),
      );
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.z).toBe(10000);
    });
  });

  describe('multiply', () => {
    it('2.0 * 0.5 = 1.0 on each axis', () => {
      // multiply([20000,0,0], 5000) = [20000*5000/10000, 0, 0] = [10000,0,0]
      const result = CmVector.multiply(new CmVector(20000, 0, 0), 5000);
      expect(result.x).toBe(10000);
      expect(result.y).toBe(0);
      expect(result.z).toBe(0);
    });
  });

  describe('normalized', () => {
    it('magnitude of normalized (3,4,0) ≈ 10000', () => {
      const v = new CmVector(30000, 40000, 0);
      const n = v.normalized;
      // magnitude should be ~10000 (±1 due to integer sqrt)
      expect(Math.abs(n.magnitude - 10000)).toBeLessThanOrEqual(1);
    });

    it('zero vector normalized is zero', () => {
      const n = CmVector.zero.normalized;
      expect(n.x).toBe(0);
      expect(n.y).toBe(0);
      expect(n.z).toBe(0);
    });
  });

  describe('serialization round-trip', () => {
    it('fromString("z") is zero', () => {
      const v = CmVector.fromString('z');
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('fromString("(12345, -6789, 0)") parses correctly', () => {
      const v = CmVector.fromString('(12345, -6789, 0)');
      expect(v.x).toBe(12345);
      expect(v.y).toBe(-6789);
      expect(v.z).toBe(0);
    });

    it('all special letters round-trip via CmVector', () => {
      const letters = ['z', 'r', 'u', 'f', 'l', 'd', 'b', 'o', 'R', 'U', 'F', 'L', 'D', 'B', 'O'];
      for (const letter of letters) {
        const v = CmVector.fromString(letter);
        const sv = v.toCmSimpleVector();
        expect(sv.toString()).toBe(letter);
      }
    });
  });

  describe('gravity', () => {
    it('is (0, -98100, 0)', () => {
      expect(CmVector.gravity.x).toBe(0);
      expect(CmVector.gravity.y).toBe(-98100);
      expect(CmVector.gravity.z).toBe(0);
    });
  });

  describe('maxXYZ', () => {
    it('returns max absolute component difference', () => {
      const a = new CmVector(100, 200, 300);
      const b = new CmVector(50, 500, 100);
      // max(|50|, |300|, |200|) = 300
      expect(CmVector.maxXYZ(a, b)).toBe(300);
    });
  });

  describe('equals', () => {
    it('same values are equal', () => {
      expect(new CmVector(1, 2, 3).equals(new CmVector(1, 2, 3))).toBe(true);
    });

    it('different values are not equal', () => {
      expect(new CmVector(1, 2, 3).equals(new CmVector(1, 2, 4))).toBe(false);
    });
  });

  // ─── Property-based tests ───────────────────────────────────────────────

  describe('property tests', () => {
    // Arbitrary for fixed-point vectors (reasonable range to avoid overflow)
    const fixedArb = fc.integer({ min: -100000, max: 100000 });
    const vectorArb = fc.tuple(fixedArb, fixedArb, fixedArb)
      .map(([x, y, z]) => new CmVector(x, y, z));

    it('dot(a, b) === dot(b, a)', () => {
      fc.assert(fc.property(vectorArb, vectorArb, (a, b) => {
        expect(CmVector.dot(a, b)).toBe(CmVector.dot(b, a));
      }), { numRuns: 1000 });
    });

    it('cross(a, b) === -cross(b, a)', () => {
      fc.assert(fc.property(vectorArb, vectorArb, (a, b) => {
        const cab = CmVector.cross(a, b);
        const cba = CmVector.cross(b, a);
        // Use + 0 to normalize -0 to 0 for Object.is comparison
        expect(cab.x + cba.x).toBe(0);
        expect(cab.y + cba.y).toBe(0);
        expect(cab.z + cba.z).toBe(0);
      }), { numRuns: 1000 });
    });

    it('dot(a, cross(a, b)) === 0 (within truncation tolerance)', () => {
      // Use smaller range to keep truncation error manageable
      const smallFixedArb = fc.integer({ min: -50000, max: 50000 });
      const smallVectorArb = fc.tuple(smallFixedArb, smallFixedArb, smallFixedArb)
        .map(([x, y, z]) => new CmVector(x, y, z));

      fc.assert(fc.property(smallVectorArb, smallVectorArb, (a, b) => {
        const c = CmVector.cross(a, b);
        // Cross truncates 3 components (error ≤1 each), dot then multiplies by a (up to 50000)
        // and sums 3 terms, so worst case ≈ 3 * 50000/10000 = 15
        expect(Math.abs(CmVector.dot(a, c))).toBeLessThanOrEqual(15);
      }), { numRuns: 1000 });
    });

    it('projectOnPlane(v, n) + project(v, n) ≈ v (±1)', () => {
      // Use unit-length normal to avoid division issues
      const unitNormals = [
        new CmVector(10000, 0, 0),
        new CmVector(0, 10000, 0),
        new CmVector(0, 0, 10000),
      ];
      const normalArb = fc.constantFrom(...unitNormals);

      fc.assert(fc.property(vectorArb, normalArb, (v, n) => {
        const proj = CmVector.project(v, n);
        const projPlane = CmVector.projectOnPlane(v, n);
        // proj + projPlane ≈ v
        expect(Math.abs((proj.x + projPlane.x) - v.x)).toBeLessThanOrEqual(1);
        expect(Math.abs((proj.y + projPlane.y) - v.y)).toBeLessThanOrEqual(1);
        expect(Math.abs((proj.z + projPlane.z) - v.z)).toBeLessThanOrEqual(1);
      }), { numRuns: 1000 });
    });
  });
});
