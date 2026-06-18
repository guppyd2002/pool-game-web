/**
 * Fixed-point math library — port of C# CalculableMechanics/CmSimpleMath + CmMath.
 *
 * All values are integers scaled by MULTIPLIER (10000).
 * 1.0 = 10000, 0.5 = 5000, 2.0 = 20000.
 *
 * CRITICAL: Every division MUST use Math.trunc() to match C# long division (truncate toward zero).
 */

/** Fixed-point number type alias. All physics values use this. */
export type Fixed = number;

/** 1.0 in fixed-point */
export const MULTIPLIER: Fixed = 10000;

/** sqrt(MULTIPLIER) = 100 */
export const SQRT_MULTIPLIER: Fixed = 100;

/** Pi in fixed-point: 3.1415 * 10000 */
export const PI: Fixed = 31415;

/** Convert float to Fixed */
export function fromFloat(val: number): Fixed {
  return Math.trunc(val * MULTIPLIER);
}

/** Convert Fixed to float */
export function toFloat(val: Fixed): number {
  return val / MULTIPLIER;
}

/** Fixed-point multiply: (a * b) / MULTIPLIER */
export function fixMul(a: Fixed, b: Fixed): Fixed {
  return Math.trunc((a * b) / MULTIPLIER);
}

/** Fixed-point divide: (a * MULTIPLIER) / b */
export function fixDiv(a: Fixed, b: Fixed): Fixed {
  return Math.trunc((a * MULTIPLIER) / b);
}

/** Absolute value */
export function fixAbs(val: Fixed): Fixed {
  return val < 0 ? -val : val;
}

/** Clamp value between min and max */
export function fixClamp(val: Fixed, min: Fixed, max: Fixed): Fixed {
  if (val - min < 0) return min;
  if (val - max > 0) return max;
  return val;
}

/** Clamp minimum */
export function fixClampMin(val: Fixed, min: Fixed = 0): Fixed {
  return val - min < 0 ? min : val;
}

/** Clamp maximum */
export function fixClampMax(val: Fixed, max: Fixed = 1): Fixed {
  return val - max > 0 ? max : val;
}

/** Lerp between from and to. time010000 is 0-10000 (0.0 to 1.0) */
export function fixLerp(from: Fixed, to: Fixed, time010000: Fixed): Fixed {
  return from + Math.trunc(((to - from) * time010000) / 10000);
}

/** Nearest value to val within [from, to] */
export function fixNear(val: Fixed, from: Fixed, to: Fixed): Fixed {
  if (val > from && val < to) {
    const a = val - from;
    const b = to - val;
    return a > b ? to : from;
  } else if (val <= from) {
    return from;
  } else {
    return to;
  }
}

// Sqrt cache (matches C# Dictionary<long, long> pattern)
const sqrtCache = new Map<Fixed, Fixed>();

/** Square root with cache (matches CmMath.SqrtSave) */
export function fixSqrtSave(val: Fixed): Fixed {
  const cached = sqrtCache.get(val);
  if (cached !== undefined) return cached;
  const result = fixSqrt(val);
  sqrtCache.set(val, result);
  return result;
}

/**
 * Integer square root — mirrors C# CmSimpleMath.Sqrt (binary search + Near rounding).
 * C# Near: returns whichever of (x1², x2²) is closer to val, tie-breaking toward lower.
 * This matches fixNear exactly.
 */
export function fixSqrt(val: Fixed): Fixed {
  if (val < 1) return 0;
  if (val === 1) return SQRT_MULTIPLIER;

  let pow = 10;
  while (val > pow * pow) {
    pow *= 10;
  }

  let x1 = Math.trunc(pow / 10);
  let x2 = pow;
  let xm = Math.trunc((x1 + x2) / 2);

  while (fixAbs(x1 - x2) > 1) {
    if (val <= xm * xm) {
      x2 = xm;
    } else {
      x1 = xm;
    }
    xm = Math.trunc((x1 + x2) / 2);
  }

  const from = x1 * x1;
  const to = x2 * x2;
  const valNear = fixNear(val, from, to);

  return valNear === from ? SQRT_MULTIPLIER * x1 : SQRT_MULTIPLIER * x2;
}

// Pow cache (matches C# pattern)
const powCache = new Map<Fixed, Fixed>();

/** Power of 2 with cache (matches CmMath.PowSave) */
export function fixPowSave(val: Fixed): Fixed {
  const cached = powCache.get(val);
  if (cached !== undefined) return cached;
  const result = fixMul(val, val);
  powCache.set(val, result);
  return result;
}

/** General power function */
export function fixPow(val: Fixed, pow: number): Fixed {
  let result = val;
  for (let i = 1; i < pow; i++) {
    result = fixMul(result, val);
  }
  return result;
}

/** Clear all caches (call between games to prevent memory leak) */
export function clearCaches(): void {
  sqrtCache.clear();
  powCache.clear();
}
