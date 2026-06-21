/**
 * Structural guardrail (千手, P1-T04 rack lock): SHIPPED rack == PARITY-TEST rack.
 *
 * Binds production getAllRackPositions() to the rack baked into the GV break
 * fixtures (GV-14/15/16 input.ballPositions in physics-golden-vectors.json).
 *
 * Why this exists: the 6349-vs-6413 rack bug survived every check because the
 * production rack and the engine-parity (GV) rack were each hardcoded and each
 * green, but NOTHING asserted they were the same rack. A self-referential golden
 * can't catch an anchor error; only binding "the rack we ship" to "the rack we
 * prove byte-equal vs C#" closes it. If anyone ever changes one without the other,
 * this turns RED — the "tested != shipped" gap becomes structurally impossible.
 *
 * Both sides ultimately derive from the C# GetBallPosition float dump; this is the
 * direct cross-assertion that makes the transitive 3-way agreement a CI invariant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getAllRackPositions } from '../../game/rack-positions';

interface FixtureVector {
  id: string;
  input: { ballPositions: Array<{ id: number; x: number; y: number; z: number }> };
}

const FIXTURE: FixtureVector[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../../tests/fixtures/physics-golden-vectors.json'), 'utf-8'),
);

describe('rack parity lock — shipped rack == GV parity-test rack', () => {
  for (const gvId of ['GV-14', 'GV-15', 'GV-16']) {
    it(`${gvId} break fixture rack is bit-exact to production getAllRackPositions()`, () => {
      const gv = FIXTURE.find(v => v.id === gvId);
      expect(gv, `${gvId} present in fixture`).toBeDefined();

      const prod = getAllRackPositions();            // 16 × { x, z } (shipped rack)
      const fixtureRack = gv!.input.ballPositions;   // 16 × { id, x, y, z } (parity-test rack)
      expect(fixtureRack.length).toBe(16);
      expect(prod.length).toBe(16);

      for (let id = 0; id < 16; id++) {
        const f = fixtureRack.find(b => b.id === id);
        expect(f, `ball ${id} in ${gvId}`).toBeDefined();
        expect(f!.x, `ball ${id} x: GV fixture vs production`).toBe(prod[id].x);
        expect(f!.z, `ball ${id} z: GV fixture vs production`).toBe(prod[id].z);
      }
    });
  }
});
