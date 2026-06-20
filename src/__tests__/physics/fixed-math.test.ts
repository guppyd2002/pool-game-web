import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MULTIPLIER, SQRT_MULTIPLIER, PI,
  fromFloat, toFloat,
  fixMul, fixDiv, fixAbs, fixClamp,
  fixLerp, fixNear, fixSqrt, fixSqrtSave, fixPowSave, fixPow,
  clearCaches,
} from '../../physics/fixed-math';

describe('fixed-math constants', () => {
  it('MULTIPLIER = 10000', () => expect(MULTIPLIER).toBe(10000));
  it('SQRT_MULTIPLIER = 100', () => expect(SQRT_MULTIPLIER).toBe(100));
  it('PI ≈ 3.1415', () => expect(PI).toBe(31415));
});

describe('fromFloat / toFloat', () => {
  it('converts 1.0', () => expect(fromFloat(1.0)).toBe(10000));
  it('converts 0.5', () => expect(fromFloat(0.5)).toBe(5000));
  it('converts -2.5', () => expect(fromFloat(-2.5)).toBe(-25000));
  it('round-trips', () => expect(toFloat(fromFloat(3.7))).toBeCloseTo(3.7, 3));
  it('truncates (not rounds)', () => expect(fromFloat(1.00005)).toBe(10000));
});

describe('fixMul', () => {
  it('1.0 * 1.0 = 1.0', () => expect(fixMul(10000, 10000)).toBe(10000));
  it('2.0 * 0.5 = 1.0', () => expect(fixMul(20000, 5000)).toBe(10000));
  it('2.0 * 3.0 = 6.0', () => expect(fixMul(20000, 30000)).toBe(60000));
  it('-1.0 * 2.0 = -2.0', () => expect(fixMul(-10000, 20000)).toBe(-20000));
  it('truncates toward zero', () => {
    // 1.0001 * 1.0001 = 1.00020001 → trunc → 1.0002
    expect(fixMul(10001, 10001)).toBe(10002);
  });
  it('negative truncation toward zero', () => {
    // -7 / 10000 would be -0.0007, but in mul: (-3 * 3) / 10000 = trunc(-0.0009) = 0
    // More meaningful: (-10001 * 10001) / 10000 = trunc(-100020001/10000) = trunc(-10002.0001) = -10002
    expect(fixMul(-10001, 10001)).toBe(-10002);
  });
});

describe('fixDiv', () => {
  it('1.0 / 1.0 = 1.0', () => expect(fixDiv(10000, 10000)).toBe(10000));
  it('6.0 / 2.0 = 3.0', () => expect(fixDiv(60000, 20000)).toBe(30000));
  it('1.0 / 3.0 truncates', () => expect(fixDiv(10000, 30000)).toBe(3333));
  it('negative division truncates toward zero', () => {
    // C# behavior: -7L / 2L = -3 (not -4)
    // fixDiv(-70000, 20000) = trunc(-70000 * 10000 / 20000) = trunc(-35000) = -35000
    // That's -3.5 in fixed → trunc = -35000 ✓
    expect(fixDiv(-10000, 30000)).toBe(-3333);
  });
});

describe('fixAbs', () => {
  it('positive unchanged', () => expect(fixAbs(5000)).toBe(5000));
  it('negative flipped', () => expect(fixAbs(-5000)).toBe(5000));
  it('zero is zero', () => expect(fixAbs(0)).toBe(0));
});

describe('fixClamp', () => {
  it('within range unchanged', () => expect(fixClamp(5000, 0, 10000)).toBe(5000));
  it('below min clamped', () => expect(fixClamp(-1000, 0, 10000)).toBe(0));
  it('above max clamped', () => expect(fixClamp(20000, 0, 10000)).toBe(10000));
});

describe('fixLerp', () => {
  it('t=0 returns from', () => expect(fixLerp(0, 10000, 0)).toBe(0));
  it('t=10000 returns to', () => expect(fixLerp(0, 10000, 10000)).toBe(10000));
  it('t=5000 returns midpoint', () => expect(fixLerp(0, 10000, 5000)).toBe(5000));
  it('works with negative', () => expect(fixLerp(-10000, 10000, 5000)).toBe(0));
});

describe('fixNear', () => {
  it('val within range, closer to from', () => expect(fixNear(3, 0, 10)).toBe(0));
  it('val within range, closer to to', () => expect(fixNear(7, 0, 10)).toBe(10));
  it('val below from', () => expect(fixNear(-5, 0, 10)).toBe(0));
  it('val above to', () => expect(fixNear(15, 0, 10)).toBe(10));
});

describe('fixSqrt', () => {
  it('sqrt(0) = 0', () => expect(fixSqrt(0)).toBe(0));
  it('sqrt(1) = 100 (SQRT_MULTIPLIER)', () => expect(fixSqrt(1)).toBe(100));
  it('sqrt(4) = 200', () => expect(fixSqrt(4)).toBe(200));
  it('sqrt(9) = 300', () => expect(fixSqrt(9)).toBe(300));
  it('sqrt(100) = 1000', () => expect(fixSqrt(100)).toBe(1000));
  it('sqrt(10000) = 10000 (i.e. sqrt(1.0) = 1.0 scaled)', () => {
    // sqrt(10000) in C# returns sqrDefoultMultiplier * 100 = 100 * 100 = 10000
    expect(fixSqrt(10000)).toBe(10000);
  });
});

describe('fixSqrtSave (cached)', () => {
  it('same result as fixSqrt', () => {
    clearCaches();
    expect(fixSqrtSave(9)).toBe(fixSqrt(9));
  });
  it('cache hit returns same value', () => {
    clearCaches();
    const first = fixSqrtSave(25);
    const second = fixSqrtSave(25);
    expect(first).toBe(second);
    expect(first).toBe(500);
  });
});

describe('fixPowSave', () => {
  it('square of 2.0', () => {
    clearCaches();
    // fixMul(20000, 20000) = (20000*20000)/10000 = 40000
    expect(fixPowSave(20000)).toBe(40000);
  });
  it('square of 100 (raw)', () => {
    clearCaches();
    // fixMul(100, 100) = (100*100)/10000 = 1
    expect(fixPowSave(100)).toBe(1);
  });
});

describe('fixPow', () => {
  it('2.0^3 = 8.0', () => {
    // fixMul(fixMul(20000,20000),20000) = fixMul(40000,20000) = 80000
    expect(fixPow(20000, 3)).toBe(80000);
  });
});

// ============ PROPERTY-BASED TESTS ============

describe('property: fixMul commutativity', () => {
  it('a*b = b*a', () => {
    fc.assert(fc.property(
      fc.integer({ min: -100000, max: 100000 }),
      fc.integer({ min: -100000, max: 100000 }),
      (a, b) => fixMul(a, b) === fixMul(b, a)
    ), { numRuns: 1000 });
  });
});

describe('property: fixMul identity', () => {
  it('a * 1.0 = a', () => {
    fc.assert(fc.property(
      fc.integer({ min: -1000000, max: 1000000 }),
      (a) => fixMul(a, MULTIPLIER) === a
    ), { numRuns: 1000 });
  });
});

describe('property: fixMul zero', () => {
  it('a * 0 = 0', () => {
    fc.assert(fc.property(
      fc.integer({ min: -1000000, max: 1000000 }),
      (a) => fixMul(a, 0) === 0
    ), { numRuns: 100 });
  });
});

describe('property: fixDiv inverse of fixMul (approximate)', () => {
  it('fixDiv(fixMul(a, b), b) ≈ a for meaningful fixed-point values', () => {
    fc.assert(fc.property(
      fc.integer({ min: 10000, max: 100000 }),
      fc.integer({ min: 10000, max: 100000 }),
      (a, b) => {
        const product = fixMul(a, b);
        const recovered = fixDiv(product, b);
        // At meaningful scale (≥1.0), truncation error is minimal
        return Math.abs(recovered - a) <= 1;
      }
    ), { numRuns: 1000 });
  });
});

describe('property: fixSqrt correctness', () => {
  it('sqrt(n) is nearest integer sqrt (floor or ceil)', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 10000 }),
      (n) => {
        const s = fixSqrt(n);
        const sInt = Math.trunc(s / SQRT_MULTIPLIER);
        // C# algorithm rounds to nearest perfect square
        // So sInt is either floor(sqrt(n)) or ceil(sqrt(n))
        const floor = Math.floor(Math.sqrt(n));
        return sInt === floor || sInt === floor + 1;
      }
    ), { numRuns: 1000 });
  });
});
