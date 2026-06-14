/**
 * Phase 0 Performance Benchmark (T14)
 * Measures physics simulation time and memory stability.
 */
import { describe, it, expect } from 'vitest';
import { MULTIPLIER } from '../../physics/fixed-math';
import { CmVector } from '../../physics/cm-vector';
import { CmSphereCollider, CmPlaneCollider } from '../../physics/colliders';
import { CmRigidbody, CmForceMode } from '../../physics/cm-rigidbody';
import { CmSpace } from '../../physics/cm-space';
import { clearCaches } from '../../physics/fixed-math';
import type { CmSpaceCube } from '../../physics/cm-collision';

// ─── Setup (same as regression test Case 6) ──────────────────────────────────

const BALL_RADIUS = 2850;
const BALL_MASS = MULTIPLIER;

const ballMaterial = {
  bounciness: 9500, rollingFriction: 500, twistingFriction: 300,
  dynamicFriction: 2000, staticFriction: 4000,
};
const tableMaterial = {
  bounciness: 2000, rollingFriction: 800, twistingFriction: 500,
  dynamicFriction: 2500, staticFriction: 4000,
};

function makeBall(pos: CmVector): CmRigidbody {
  const c = new CmSphereCollider();
  c.position = pos;
  c.radius = BALL_RADIUS;
  c.enabled = true;
  c.scale = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
  c.material = { ...ballMaterial };
  const b = new CmRigidbody();
  b.mass = BALL_MASS;
  b.collider = c;
  b.centreOfMass = CmVector.zero;
  return b;
}

function createFullRack(): CmSpace {
  const spaceCube: CmSpaceCube = { position: CmVector.zero, scale: new CmVector(500000, 500000, 500000) };
  const spacing = BALL_RADIUS * 2 + 5;
  const bodies: CmRigidbody[] = [];

  // Cue ball
  bodies.push(makeBall(new CmVector(-50000, BALL_RADIUS, 0)));

  // 15-ball triangle
  const rackX = 50000;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = rackX + row * spacing;
      const z = (col * 2 - row) * Math.trunc(spacing / 2);
      bodies.push(makeBall(new CmVector(x, BALL_RADIUS, z)));
    }
  }

  const plane = new CmPlaneCollider();
  plane.position = CmVector.zero;
  plane.up = new CmVector(0, MULTIPLIER, 0);
  plane.right = new CmVector(MULTIPLIER, 0, 0);
  plane.forward = new CmVector(0, 0, MULTIPLIER);
  plane.scale = new CmVector(254000, 0, 127000);
  plane.radius = 127000;
  plane.enabled = true;
  plane.material = { ...tableMaterial };

  const space = new CmSpace();
  space.init(spaceCube, bodies, [plane], []);
  for (const b of space.rigidbodies) b.isActive = false;
  return space;
}

// ─── Benchmarks ──────────────────────────────────────────────────────────────

describe('Phase 0 Performance Benchmark', () => {
  it('physics simulation: 16-ball break shot < 200ms', () => {
    const space = createFullRack();
    const cueBall = space.rigidbodies[0];

    // Apply break shot
    space.activate();
    cueBall.isActive = true;
    cueBall.addImpulse(new CmVector(45000, 0, 0), cueBall.collider.position, CmForceMode.Impulse);

    const start = performance.now();
    let steps = 0;
    while (space.isActive && steps < 20000) {
      space.calculate(null, false);
      steps++;
    }
    const elapsed = performance.now() - start;

    console.log(`\n  📊 BENCHMARK: 16-ball break shot`);
    console.log(`     Steps: ${steps}`);
    console.log(`     Time: ${elapsed.toFixed(1)}ms`);
    console.log(`     Steps/ms: ${(steps / elapsed).toFixed(1)}`);

    expect(space.isActive).toBe(false);
    expect(elapsed).toBeLessThan(200); // Target: < 200ms
  });

  it('memory stability: 10 consecutive shots, no significant growth', () => {
    const space = createFullRack();
    const cueBall = space.rigidbodies[0];

    const shots = 10;
    const heapSamples: number[] = [];

    for (let shot = 0; shot < shots; shot++) {
      // Clear caches between shots
      clearCaches();

      // Reset and shoot
      space.activate();
      for (const b of space.rigidbodies) b.isActive = false;
      cueBall.collider.position = new CmVector(-50000, BALL_RADIUS, 0);
      cueBall.velocity = CmVector.zero;
      cueBall.isActive = true;
      cueBall.addImpulse(
        new CmVector(40000 + shot * 1000, 0, shot * 500),
        cueBall.collider.position,
        CmForceMode.Impulse,
      );

      let steps = 0;
      while (space.isActive && steps < 15000) {
        space.calculate(null, false);
        steps++;
      }

      // Sample heap (if available)
      if (typeof process !== 'undefined' && process.memoryUsage) {
        heapSamples.push(process.memoryUsage().heapUsed);
      }
    }

    if (heapSamples.length > 0) {
      const firstHalf = heapSamples.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const secondHalf = heapSamples.slice(5).reduce((a, b) => a + b, 0) / 5;
      const growthPercent = ((secondHalf - firstHalf) / firstHalf) * 100;

      console.log(`\n  📊 BENCHMARK: Memory stability (${shots} shots)`);
      console.log(`     First 5 avg heap: ${(firstHalf / 1024 / 1024).toFixed(1)}MB`);
      console.log(`     Last 5 avg heap: ${(secondHalf / 1024 / 1024).toFixed(1)}MB`);
      console.log(`     Growth: ${growthPercent.toFixed(1)}%`);

      // Allow up to 20% growth (GC timing variance)
      expect(growthPercent).toBeLessThan(20);
    }

    expect(true).toBe(true); // Always pass if heap not available
  });
});
