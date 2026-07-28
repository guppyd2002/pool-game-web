/**
 * SP-Harden-4: lock ball gloss exposure so specular does not re-blow out numbers.
 * CEO 真機 2026-07-28: clearcoat 1.0 / pure-white disc washed out glyphs.
 * Spec: aim-assist-and-group-hud-spec.md §項目1 — tuning only, no SDF layout change.
 */
import { describe, it, expect } from 'vitest';
import { BALL_GLOSS, BALL_WHITE_RGB, makeBallMaterial } from '../../renderer/ball-materials';

describe('SP-Harden-4 ball gloss exposure (number legibility)', () => {
  it('clearcoat is reduced from full-mirror 1.0', () => {
    expect(BALL_GLOSS.clearcoat).toBeLessThan(1.0);
    expect(BALL_GLOSS.clearcoat).toBeGreaterThan(0.3);
  });

  it('clearcoatRoughness softens razor specular peak', () => {
    expect(BALL_GLOSS.clearcoatRoughness).toBeGreaterThanOrEqual(0.08);
  });

  it('envMapIntensity is attenuated below RoomEnvironment default 1.0', () => {
    expect(BALL_GLOSS.envMapIntensity).toBeLessThan(1.0);
    expect(BALL_GLOSS.envMapIntensity).toBeGreaterThan(0.2);
  });

  it('base roughness is above pure-mirror 0.08 so hot-spots ease', () => {
    expect(BALL_GLOSS.roughness).toBeGreaterThan(0.08);
  });

  it('soft white disc is not near-pure white (avoids specular stack wash-out)', () => {
    const [r, g, b] = BALL_WHITE_RGB;
    expect(r).toBeLessThan(0.96);
    expect(g).toBeLessThan(0.96);
    expect(b).toBeLessThan(0.96);
    // Still light enough to read black glyphs
    expect(r).toBeGreaterThan(0.75);
  });

  it('makeBallMaterial applies gloss exposure params on solids and cue', () => {
    const solid = makeBallMaterial(1);
    expect(solid.clearcoat).toBe(BALL_GLOSS.clearcoat);
    expect(solid.clearcoatRoughness).toBe(BALL_GLOSS.clearcoatRoughness);
    expect(solid.envMapIntensity).toBe(BALL_GLOSS.envMapIntensity);
    expect(solid.roughness).toBe(BALL_GLOSS.roughness);

    const cue = makeBallMaterial(0);
    expect(cue.clearcoat).toBe(BALL_GLOSS.clearcoat);
    expect(cue.envMapIntensity).toBe(BALL_GLOSS.envMapIntensity);
  });
});
