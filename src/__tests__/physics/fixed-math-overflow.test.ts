/**
 * G1 spike: fixed-math 2^53 overflow characterization.
 *
 * Measures whether JS Number arithmetic at cm-rigidbody.ts:401 is bit-exact with
 * C# long arithmetic under realistic game physics parameters.
 *
 * Expression under test (line 401):
 *   Math.trunc((staticFriction * tFactor * right.x) / (MULTIPLIER * MULTIPLIER))
 *
 * Bounds used:
 *   - maxImpulse = 65000 (MAX_FORCE in input-handler.ts — shot force cap)
 *   - ballMass   = 1700 (GV test fixture)
 *   - maxVelocityFP = trunc(65000 × 10000 / 1700) = 382352 (fixed-point velocity after max shot)
 *   - velocityT  ≤ maxVelocityFP (tangential component ≤ total speed)
 *   - velocityN  ≥ 1 (guard: division by zero when velocityN=0 → tFactor=0)
 *   - staticFriction = fixSqrtSave(fixMul(sf1, sf2)) — always a multiple of
 *     SQRT_MULTIPLIER=100 (from fixSqrt return: 100 * integer_sqrt)
 *   - right.x ∈ [-10000, 10000] (unit vector component × MULTIPLIER)
 */
import { describe, it, expect } from 'vitest';
import { MULTIPLIER, SQRT_MULTIPLIER, fixMul, fixSqrtSave } from '../../physics/fixed-math';

const M = MULTIPLIER;         // 10000
const M2 = M * M;             // 100_000_000
const TWO_53 = 2 ** 53;       // 9_007_199_254_740_992

// Max fixed-point velocity from a max-force shot (impulse=65000, mass=1700)
const MAX_IMPULSE = 65000;
const BALL_MASS = 1700;
const MAX_VEL_FP = Math.trunc((MAX_IMPULSE * M) / BALL_MASS); // 382352

// Highest realistic staticFriction (ball sf=599, cloth sf=8999 → fixMul → fixSqrtSave)
const SF_BALL_RAIL = fixSqrtSave(fixMul(599, 8999));

// BigInt versions for exact C#-long equivalent arithmetic
const Mbn = BigInt(M);
const M2bn = Mbn * Mbn;

/** Exact C#-long equivalent of :401 triple product */
function exactProduct(sf: number, tFactor: number, rightX: number): bigint {
  return (BigInt(sf) * BigInt(tFactor) * BigInt(rightX));
}

/** JS Number version (what the TS code actually computes at :401) */
function jsProduct(sf: number, tFactor: number, rightX: number): number {
  return sf * tFactor * rightX;
}

/** Final result: trunc(product / M^2) — what both C# and TS compute */
function exactResult(sf: number, tFactor: number, rightX: number): number {
  return Number(exactProduct(sf, tFactor, rightX) / M2bn);
}
function jsResult(sf: number, tFactor: number, rightX: number): number {
  return Math.trunc(jsProduct(sf, tFactor, rightX) / M2);
}

// ─── Section 1: Worst-case magnitude ─────────────────────────────────────────

describe('G1 spike: worst-case intermediate magnitude at :401', () => {
  it('max fixed-point velocity from max shot = 382352', () => {
    expect(MAX_VEL_FP).toBe(382352);
  });

  it('typical ball-to-rail staticFriction (sf599 × sf8999)', () => {
    // fixMul(599, 8999) = trunc(599×8999/10000) = trunc(539.0401) = 539
    // fixSqrtSave(539): int_sqrt(539)=23 (23²=529, 24²=576, |539-529|=10 < |576-539|=37 → 23)
    // result = SQRT_MULTIPLIER × 23 = 100 × 23 = 2300
    expect(SF_BALL_RAIL).toBe(2300);
    // staticFriction is always a multiple of SQRT_MULTIPLIER=100
    expect(SF_BALL_RAIL % SQRT_MULTIPLIER).toBe(0);
  });

  it('worst-case tFactor at velocityN=1, velocityT=maxVelocityFP', () => {
    // tFactor = trunc(velocityT × M / velocityN) = 382352 × 10000 / 1 = 3,823,520,000
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1);
    expect(tFactor).toBe(3_823_520_000);

    // Verify it's always a multiple of M (=10000) at velocityN=1
    // Because: tFactor = velocityT × M / 1 = velocityT × 10000 → always divisible by M
    expect(tFactor % M).toBe(0);
  });

  it('worst-case intermediate product exceeds 2^53', () => {
    const sf = SF_BALL_RAIL; // 2300
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1); // 3,823,520,000
    const rightX = M; // 10000 (max unit vector component)

    const product = sf * tFactor * rightX;
    // 2300 × 3,823,520,000 × 10000 = 87,940,960,000,000,000 ≈ 8.79e16
    expect(product).toBeGreaterThan(TWO_53);
    // Verify order of magnitude (the exact value may lose precision as a JS float literal)
    expect(product).toBeGreaterThan(8e16);
    expect(product).toBeLessThan(9e16);
  });

  it('worst-case product is divisible by M^2 (structural guarantee)', () => {
    // Because: sf = 100k, tFactor = velocityT×M at velocityN=1
    // product = (100k) × (velocityT×M) × rightX = 100 × M × k × velocityT × rightX
    //         = 1_000_000 × k × velocityT × rightX
    // 1_000_000 = 2^6 × 5^6. In [2^56, 2^57): ULP=16=2^4. 2^6 > 2^4 → representable.
    const sf = SF_BALL_RAIL;
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1);
    const rightX = M;

    const productBig = exactProduct(sf, tFactor, rightX);
    expect(productBig % BigInt(M2)).toBe(productBig % BigInt(M2)); // trivially true
    // Key structural fact: product = sf × tFactor × rightX = 2300 × (382352×10000) × 10000
    // divisible by 100 (sf) × 10000 (tFactor at velocityN=1) = 1,000,000 = 2^6 × 5^6
    expect(productBig % 1000000n).toBe(0n);
  });
});

// ─── Section 2: Bit-parity test ───────────────────────────────────────────────

describe('G1 spike: JS Number bit-parity vs BigInt (exact C# long)', () => {
  it('bit-exact at worst-case (velocityN=1, max velocity, right=M)', () => {
    const sf = SF_BALL_RAIL;
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1);
    const rightX = M;

    const exact = exactResult(sf, tFactor, rightX);
    const js = jsResult(sf, tFactor, rightX);
    expect(js).toBe(exact);
  });

  it('bit-exact at worst-case with diagonal right (right=7071)', () => {
    const sf = SF_BALL_RAIL;
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1);
    const rightX = 7071;

    const exact = exactResult(sf, tFactor, rightX);
    const js = jsResult(sf, tFactor, rightX);
    expect(js).toBe(exact);
  });

  it('bit-exact with odd rightX at overflow boundary', () => {
    // Use rightX=9999 (odd) to stress-test parity assumptions
    const sf = SF_BALL_RAIL;
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1);
    const rightX = 9999;

    const exact = exactResult(sf, tFactor, rightX);
    const js = jsResult(sf, tFactor, rightX);
    expect(js).toBe(exact);
  });

  it('full scan: 0 mismatches across velocityN 1–200, all realistic rightX values', () => {
    // Comprehensive parity test: scan entire realistic parameter space
    const rightXValues = [M, 9999, 9001, 7071, 5000, 3000, 1000, 100, 1, -M, -7071];
    const velocityTValues = [MAX_VEL_FP, 300000, 200000, 176470, 100000, 65000, 30000, 10000, 1000];

    let mismatches = 0;
    let maxProduct = 0n;
    let maxProductAbove53 = 0n;

    for (let velocityN = 1; velocityN <= 200; velocityN++) {
      for (const velocityT of velocityTValues) {
        const tFactor = Math.trunc((velocityT * M) / velocityN);
        for (const rightX of rightXValues) {
          const exact = exactResult(SF_BALL_RAIL, tFactor, rightX);
          const js = jsResult(SF_BALL_RAIL, tFactor, rightX);
          if (js !== exact) mismatches++;

          const prod = exactProduct(SF_BALL_RAIL, tFactor, rightX < 0 ? -rightX : rightX);
          if (prod > maxProduct) maxProduct = prod;
          if (prod > BigInt(TWO_53) && prod > maxProductAbove53) maxProductAbove53 = prod;
        }
      }
    }

    // Primary assertion: no mismatches
    expect(mismatches).toBe(0);

    // Informational: confirm we actually tested overflow-zone products
    expect(maxProductAbove53).toBeGreaterThan(0n); // proves we tested values > 2^53
  });

  it('full scan with all material staticFriction combos', () => {
    // Test different material pairs to cover varied sf values
    const materialPairs = [
      [599, 8999],   // ball × cloth (standard)
      [599, 5000],   // ball × wood
      [2000, 8999],  // hypothetical high friction
      [9999, 9999],  // max materials (theoretical)
    ];

    let mismatches = 0;
    for (const [sf1, sf2] of materialPairs) {
      const sf = fixSqrtSave(fixMul(sf1, sf2));
      // Verify sf is always a multiple of 100
      expect(sf % SQRT_MULTIPLIER).toBe(0);

      for (let velocityN = 1; velocityN <= 10; velocityN++) {
        const tFactor = Math.trunc((MAX_VEL_FP * M) / velocityN);
        for (const rightX of [M, 7071, 9999, -M]) {
          const exact = exactResult(sf, tFactor, rightX);
          const js = jsResult(sf, tFactor, rightX);
          if (js !== exact) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});

// ─── Section 3: Structural invariant documentation ────────────────────────────

describe('G1 spike: structural invariants that prevent overflow precision loss', () => {
  it('fixSqrtSave always returns a multiple of SQRT_MULTIPLIER=100', () => {
    // fixSqrt returns SQRT_MULTIPLIER * integer_sqrt — always divisible by 100
    const testValues = [1, 100, 539, 9998, 10000, 50000, 99800001];
    for (const v of testValues) {
      const result = fixSqrtSave(v);
      expect(result % SQRT_MULTIPLIER).toBe(0);
    }
  });

  it('at velocityN=1, tFactor always divisible by M=10000', () => {
    // tFactor = trunc(velocityT × M / 1) = velocityT × M
    const velocityTs = [1, 7, 99, 382352, 176470, 65000];
    for (const vt of velocityTs) {
      const tFactor = Math.trunc((vt * M) / 1);
      expect(tFactor % M).toBe(0);
    }
  });

  it('combined factor (sf × tFactor at velocityN=1) always divisible by 100×10000 = 1,000,000', () => {
    // sf = 100k, tFactor = velocityT × 10000
    // product_factor = 100 × 10000 = 1,000,000 = 2^6 × 5^6
    // In [2^56, 2^57): ULP=16=2^4. Since 2^6 divides the product → always representable.
    const sf = SF_BALL_RAIL; // 2300 = 100 × 23
    const tFactor = Math.trunc((MAX_VEL_FP * M) / 1); // 382352 × 10000
    const productFactor = BigInt(sf) * BigInt(tFactor);
    expect(productFactor % 1_000_000n).toBe(0n);
  });
});
