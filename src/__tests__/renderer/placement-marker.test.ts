/**
 * CUE-014: placement-marker pure helper tests.
 * Tests markerPulseScale — the breathing animation helper.
 */
import { describe, it, expect } from 'vitest';
import { markerPulseScale } from '../../renderer/placement-marker';

describe('markerPulseScale', () => {
  it('returns 1 when amp=0 (no pulse)', () => {
    expect(markerPulseScale(0, 2, 0)).toBeCloseTo(1, 10);
    expect(markerPulseScale(0.5, 2, 0)).toBeCloseTo(1, 10);
  });

  it('t=0: scale = 1 (sin(0)=0)', () => {
    expect(markerPulseScale(0, 2, 0.15)).toBeCloseTo(1, 10);
  });

  it('t=0.25/freq: scale = 1+amp (peak, sin(π/2)=1)', () => {
    // freq=2, t=0.25 → t*freq*2π = π → sin(π)... wait: t=0.25, freq=2
    // t * freq * 2π = 0.25 * 2 * 2π = π → sin(π) = 0 (that's a crossing)
    // t=0.125, freq=2 → 0.125*2*2π = π/2 → sin(π/2)=1 → peak
    expect(markerPulseScale(0.125, 2, 0.15)).toBeCloseTo(1.15, 6);
  });

  it('t=0.375/freq: scale = 1-amp (trough, sin(3π/2)=-1)', () => {
    // t=0.375, freq=2 → 0.375*2*2π = 3π/2 → sin(3π/2)=-1 → trough
    expect(markerPulseScale(0.375, 2, 0.15)).toBeCloseTo(0.85, 6);
  });

  it('amplitude proportional: amp=0.3 gives ±0.3 range', () => {
    expect(markerPulseScale(0.125, 2, 0.3)).toBeCloseTo(1.3, 6);
    expect(markerPulseScale(0.375, 2, 0.3)).toBeCloseTo(0.7, 6);
  });

  it('freq=1 completes one cycle per second', () => {
    // t=0.25 → sin(2π * 0.25) = sin(π/2) = 1 → peak
    expect(markerPulseScale(0.25, 1, 0.15)).toBeCloseTo(1.15, 6);
    // t=1.0 → sin(2π) = 0 → back to base
    expect(markerPulseScale(1.0, 1, 0.15)).toBeCloseTo(1, 6);
  });
});
