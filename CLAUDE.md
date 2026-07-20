# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on :5173
npm run build        # Production build → dist/
npm run typecheck    # tsc --noEmit (no emit, strict unused locals/params)
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright smoke tests (requires dev server on :5173)
```

**Run a single test file:**
```bash
npx vitest run src/__tests__/physics/fuzz-parity.test.ts
```

**Run e2e tests** — Playwright auto-starts the dev server (`reuseExistingServer: !CI`). Manual dev server must be on `:5173` if already running.

## Architecture

### Three-layer separation

```
src/physics/    — pure fixed-point math, zero browser deps
src/game/       — rules, cue, session logic; depends on physics only
src/renderer/   — Three.js scene + DOM UI; depends on game and physics
src/main.ts     — entry point; wires all three layers, owns the RAF loop
```

### Physics layer (`src/physics/`)

A faithful port of the C# `CalculableMechanics` engine from `_Game/Scenes/Game.unity`.

- **Fixed-point integers only.** `MULTIPLIER = 10000` → 1 unit = 0.0001 m. All values are `Fixed = number` (JS integer).
- **Every division must use `Math.trunc()`** to match C# `long` truncation. Breaking this breaks determinism parity with C#.
- `constants.ts` is the single source of truth for all physics values — table geometry, materials, pocket positions, `MAX_FORCE=13000`. Never hardcode these elsewhere.
- `CmSpace` runs the simulation; `simulateToCompletion()` in `simulate.ts` drives it to quiescence.
- `BallPoolPhysics` (`game/ball-pool-physics.ts`) is the facade: game/cue/AI code interacts only through `IBallPoolPhysics`, never touching `CmSpace` directly.

**Determinism golden vectors:** `tests/fixtures/physics-golden-vectors.json` contains 1000 C#-generated shot outcomes. `fuzz-parity.test.ts` verifies bit-exact parity. To regenerate: `cd tools/golden-vector-runner && ~/.dotnet/dotnet run -c Release > ../../tests/fixtures/physics-golden-vectors.json`.

### Game layer (`src/game/`)

- `table-setup.ts` — builds `CmSpace` with the 19-collider table (1 plane + 2 long rails + 4 end + 8 corner jaw + 4 side jaw). The `table-collider-parity.test.ts` parity-locks this count; any change breaks that test deliberately.
- `game-session.ts` — orchestrates shot → rule-engine → replay → turn-change pipeline.
- `rule-engine.ts` — 8-ball rules; `game-store.ts` holds immutable game state dispatched as events.
- `cue-controller.ts` — aim/fire state machine; `cue-adapter.ts` translates pointer events to cue inputs.

### Renderer layer (`src/renderer/`)

- `scene.ts` — creates the Three.js scene, loads `public/PoolTable.glb`, exposes `SceneAPI`.
- **GLB model scale — uniform (chief architect directive 2026-07-20):** `scaleX = scaleY = scaleZ = 0.11042`. Derived from Unity felt half (1.481m) / GLB felt half (13.412) — makes web GLB world-size equal Unity mesh world-size. Unity mesh confirmed aligned with physics (佛朗基: cushion on rail, pocket near trigger). Felt overhangs rails ~211mm per side (same as Unity). Do not change without explicit directive from the chief architect.
- **Sukno (felt) material:** `MeshBasicMaterial` (unlit) with `color: 0x0f7b3a`, `polygonOffset: true/factor:-1/units:-1`, `map: null` (Cloth2 grey texture dropped — it compressed luminance from 83 to 19). Target luminance ≈ 83 (Rec.601). `polygonOffset` is present but was proven ineffective against the felt-to-cushion seam lines (mesh gap, not coplanar Z-fighting).
- **Debug collider overlay** (`debug-colliders.ts`): cyan `LineSegments`, `visible = false` by default. Only exposed via `scene.toggleColliders()` / `window.__poolDebug.toggleColliders()`. Never auto-enables in production.
- `pocket-visuals.ts` — black disc meshes at `POCKET_POSITIONS / PHYSICS_MULTIPLIER`, Y=0.001 to avoid Z-fighting with the felt.

### Entry point (`src/main.ts`)

Top-level `await createScene()` (module-level await, Vite ESM). All subsystems wired here. `window.__poolDebug` exposes test hooks for Playwright smoke tests (`camera`, `balls`, `toggleColliders`, etc.).

### Test structure

- `src/__tests__/physics/` — unit tests for fixed-point math and physics engine
- `src/__tests__/game/` — unit tests for rules, session, cue, AI
- `src/__tests__/renderer/` — unit tests for renderer modules (Three.js mocked via happy-dom)
- `tests/smoke/` — Playwright e2e tests against the live dev server; screenshots saved to `tests/smoke/screenshots/`

Vitest uses `environment: 'node'` (not jsdom). Three.js is pre-bundled inline to prevent parallel-worker module-cache races (`server.deps.inline: ['three']`).
